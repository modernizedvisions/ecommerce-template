import type Stripe from 'stripe';
import { sendEmail } from '../../_lib/email';
import {
  renderOrderConfirmationEmailHtml,
  renderOrderConfirmationEmailText,
  type OrderConfirmationEmailItem,
} from '../../_lib/orderConfirmationEmail';
import { renderOwnerInvoicePaidEmail, type EmailItem } from '../../_lib/emailTemplates';
import {
  formatMoney,
  formatShippingMoney,
  renderOwnerNewSaleEmailHtml,
  renderOwnerNewSaleEmailText,
  type OwnerNewSaleItem,
} from '../../_lib/ownerNewSaleEmail';
import { resolveEmailMoneyTotals } from '../../_lib/emailTotals';
import {
  extractShippingCentsFromLineItems,
  filterNonShippingLineItems,
  isShippingLineItem,
} from '../lib/shipping';
import { resolveCustomOrderEmailImage } from '../../_lib/customOrderEmailImages';
import { constructStripeEvent, listCheckoutSessionLineItems, retrieveCheckoutSession } from '../../_lib/stripeClient';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DB: D1Database;
  EMAIL_OWNER_TO?: string;
  EMAIL_FROM?: string;
  RESEND_OWNER_TO?: string;
  RESEND_FROM?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  EMAIL_DEBUG?: string;
  SHIPPING_DEBUG?: string;
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  PUBLIC_IMAGES_BASE_URL?: string;
};

const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

type EmailLogPayload = {
  kind: string;
  branch: string;
  orderLabel?: string | null;
  subject: string;
  hasTo: boolean;
  htmlLen: number;
  textLen: number;
};

type EmailResultPayload = {
  kind: string;
  branch: string;
  orderLabel?: string | null;
  ok: boolean;
  error?: string | null;
};

function logEmailBranch(debug: boolean, payload: { branch: string; orderLabel?: string | null; hasCustomerEmail: boolean; hasOwnerTo: boolean }) {
  if (!debug) return;
  console.log('[email] branch', payload);
}

function logEmailPrepare(debug: boolean, payload: EmailLogPayload) {
  if (!debug) return;
  console.log('[email] prepare', payload);
}

function logEmailResult(debug: boolean, payload: EmailResultPayload) {
  if (!debug) return;
  console.log('[email] sent', payload);
}

function logEmailTemplateError(debug: boolean, payload: { kind: string; branch: string; orderLabel?: string | null; err: string }) {
  if (!debug) return;
  console.error('[email] template_render_failed', payload);
}

function isValidEmailRecipient(to: string | null | undefined): to is string {
  return typeof to === 'string' && to.includes('@');
}

function warnInvalidRecipient(kind: string, to: string) {
  console.warn('[email] invalid recipient; skipping send', { kind, to });
}

type CanonicalTotals = {
  amountTotal: number;
  amountSubtotal: number;
  amountShipping: number;
  amountTax: number;
  amountDiscount: number;
  currency: string;
};

function resolveCanonicalTotals(session: Stripe.Checkout.Session): CanonicalTotals {
  const toCents = (value: unknown) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
  const totalDetails = session.total_details as Stripe.Checkout.Session.TotalDetails | null;
  return {
    amountTotal: toCents(session.amount_total),
    amountSubtotal: toCents(session.amount_subtotal),
    amountShipping: toCents(totalDetails?.amount_shipping),
    amountTax: toCents(totalDetails?.amount_tax),
    amountDiscount: toCents(totalDetails?.amount_discount),
    currency: session.currency || 'usd',
  };
}

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}) => {
  const { request, env } = context;
  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO;
  const siteUrl = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const emailDebug = env.EMAIL_DEBUG === '1' || (env as any).DEBUG_EMAILS === '1';
  const ok = () =>
    new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe secrets are not configured');
    return new Response('Stripe is not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = await constructStripeEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      STRIPE_WEBHOOK_TOLERANCE_SECONDS
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('[stripe webhook] received event', { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
      const eventType = event.type;
      const sessionSummary = event.data.object as Stripe.Checkout.Session;
      console.log('[stripe webhook] checkout.session', { eventType, sessionId: sessionSummary.id });
      const session = await retrieveCheckoutSession(env.STRIPE_SECRET_KEY, sessionSummary.id, {
        expand: [
          'payment_intent',
          'payment_intent.payment_method',
          'payment_intent.charges.data.payment_method_details',
          'payment_intent.shipping',
        ],
      });
      const lineItemsResp = await listCheckoutSessionLineItems(env.STRIPE_SECRET_KEY, session.id, {
        limit: 100,
        expand: ['data.price.product'],
      });
      const rawLineItems = lineItemsResp.data || [];
      console.log('[stripe webhook] line_items', { eventType, sessionId: session.id, count: rawLineItems.length });
      const sessionWithLines = { ...session, line_items: { data: rawLineItems } as any };

      const paymentIntent =
        sessionWithLines.payment_intent && typeof sessionWithLines.payment_intent !== 'string'
          ? sessionWithLines.payment_intent
          : null;
      const paymentIntentId =
        typeof sessionWithLines.payment_intent === 'string'
          ? sessionWithLines.payment_intent
          : sessionWithLines.payment_intent?.id || null;

      const customerEmail = sessionWithLines.customer_details?.email || paymentIntent?.receipt_email || null;
      const customerEmailSource = sessionWithLines.customer_details?.email
        ? 'session.customer_details.email'
        : paymentIntent?.receipt_email
        ? 'payment_intent.receipt_email'
        : 'missing';
      console.log('[stripe webhook] email config', {
        hasResendApiKey: !!env.RESEND_API_KEY,
        hasFromAddress: !!(env.RESEND_FROM || env.RESEND_FROM_EMAIL || env.EMAIL_FROM),
        hasOwnerTo: !!ownerTo,
        customerEmailSource,
        hasCustomerEmail: !!customerEmail,
      });
      const shippingDetails =
        (sessionWithLines.shipping_details as Stripe.Checkout.Session.ShippingDetails | null) || paymentIntent?.shipping || null;
      const shippingName =
        shippingDetails?.name ||
        sessionWithLines.customer_details?.name ||
        null;
      const shippingAddress = shippingDetails?.address || null;

      const firstCharge = paymentIntent?.charges?.data?.[0];
      console.log(
        'PI first charge method details (safe)',
        JSON.stringify(
          firstCharge?.payment_method_details
            ? {
                type: firstCharge.payment_method_details.type,
                card:
                  firstCharge.payment_method_details.type === 'card'
                    ? {
                        brand: (firstCharge.payment_method_details as any).card?.brand ?? null,
                        last4: (firstCharge.payment_method_details as any).card?.last4 ?? null,
                      }
                    : undefined,
                us_bank_account:
                  firstCharge.payment_method_details.type === 'us_bank_account'
                    ? {
                        bank_name: (firstCharge.payment_method_details as any).us_bank_account?.bank_name ?? null,
                        last4: (firstCharge.payment_method_details as any).us_bank_account?.last4 ?? null,
                      }
                    : undefined,
              }
            : null,
          null,
          2
        )
      );

      let cardLast4: string | null = null;
      let cardBrand: string | null = null;

      if (paymentIntent?.charges?.data?.length) {
        const charge = paymentIntent.charges.data[0];
        const pmd = charge.payment_method_details as any;

        if (pmd?.card) {
          cardLast4 = pmd.card.last4 ?? null;
          cardBrand = pmd.card.brand ?? null;
        } else if (pmd?.link?.card) {
          // Link payment backed by a card
          cardLast4 = pmd.link.card.last4 ?? null;
          cardBrand = pmd.link.card.brand ?? null;
        } else if (pmd?.us_bank_account) {
          cardLast4 = pmd.us_bank_account.last4 ?? null;
          cardBrand = pmd.us_bank_account.bank_name ?? 'us_bank_account';
        }
      }

      if (!cardLast4 && paymentIntent?.payment_method && typeof paymentIntent.payment_method !== 'string') {
        const pm = paymentIntent.payment_method as Stripe.PaymentMethod;
        if (pm.card) {
          cardLast4 = pm.card.last4 ?? null;
          cardBrand = pm.card.brand ?? null;
        }
      }

      console.log('checkout.session summary', {
        eventType,
        sessionId: session.id,
        paymentStatus: session.payment_status,
        hasCustomerEmail: !!customerEmail,
        shippingName,
        hasShippingAddress: !!shippingAddress,
        cardLast4,
        cardBrand,
      });

      const productId = session.metadata?.product_id;
      const quantityFromMeta = session.metadata?.quantity ? Number(session.metadata.quantity) : 1;

      const invoiceId = session.metadata?.invoiceId;
      const customOrderId =
        session.metadata?.customOrderId ||
        session.metadata?.custom_order_id ||
        session.metadata?.customOrderID ||
        null;
      const customSource = session.metadata?.source === 'custom_order';
      console.log('[webhook][custom-order-email] classification', {
        eventId: event.id,
        sessionId: session.id,
        isCustomSource: customSource,
        hasCustomOrderId: !!customOrderId,
        hasInvoiceId: !!invoiceId,
      });
      const canonicalTotals = resolveCanonicalTotals(session);
      const shippingFromLines = extractShippingCentsFromLineItems(rawLineItems);
      const shippingCents =
        canonicalTotals.amountShipping > 0 ? canonicalTotals.amountShipping : shippingFromLines;
      const isPaid = session.payment_status === 'paid';
      if (env.SHIPPING_DEBUG === '1' || env.EMAIL_DEBUG === '1' || (env as any).DEBUG_EMAILS === '1') {
        console.log('[shipping] webhook', {
          eventType,
          sessionId: session.id,
          amount_total: canonicalTotals.amountTotal,
          amount_subtotal: canonicalTotals.amountSubtotal,
          amount_shipping: canonicalTotals.amountShipping,
          amount_tax: canonicalTotals.amountTax,
          amount_discount: canonicalTotals.amountDiscount,
          shippingCents,
          shippingSource: canonicalTotals.amountShipping > 0 ? 'session.total_details.amount_shipping' : 'line_items',
        });
      }

      if (invoiceId) {
        await handleCustomInvoicePayment({
          db: env.DB,
          env,
          session: sessionWithLines,
          lineItems: rawLineItems,
          paymentIntentId,
          totals: canonicalTotals,
          customerEmail,
          isPaid,
        });
        return ok();
      } else if (customOrderId || customSource) {
        await handleCustomOrderPayment({
          db: env.DB,
          env,
          requestUrl: request.url,
          session: sessionWithLines,
          lineItems: rawLineItems,
          paymentIntentId,
          customerEmail,
          shippingName,
          shippingAddress,
          cardLast4,
          cardBrand,
          shippingCents,
          totals: canonicalTotals,
          isPaid,
        });
        return ok();
      } else if (isPaid) {
        // Update inventory for all line items (skip shipping)
        const lineItems = rawLineItems;
        const aggregate = new Map<string, { qty: number; sources: Set<string> }>();
        const missingKeys: Array<{ priceId?: string | null; stripeProductId?: string | null }> = [];
        for (const line of lineItems) {
          if (isShippingLineItem(line)) continue;
          const meta = extractOptionMetadata(line);
          const metadataProductId = meta.sourceProductId ? meta.sourceProductId.trim() : '';
          const productIdFromPrice =
            typeof line.price?.product === 'string'
              ? line.price.product
              : (line.price?.product as Stripe.Product | undefined)?.id;
          const priceId = typeof line.price?.id === 'string' ? line.price.id : null;
          const fallbackSessionProductId = typeof productId === 'string' ? productId : null;
          const key = metadataProductId || productIdFromPrice || priceId || fallbackSessionProductId;
          const qty = line.quantity ?? 1;
          if (!key) {
            missingKeys.push({ priceId, stripeProductId: productIdFromPrice });
            continue;
          }
          const source = metadataProductId
            ? 'metadata'
            : productIdFromPrice
            ? 'stripe_product'
            : priceId
            ? 'stripe_price'
            : 'session_metadata';
          const existing = aggregate.get(key);
          if (existing) {
            existing.qty += qty;
            existing.sources.add(source);
          } else {
            aggregate.set(key, { qty, sources: new Set([source]) });
          }
        }

        if (missingKeys.length) {
          console.warn('[sold-update] line items missing product keys', {
            sessionId: session.id,
            count: missingKeys.length,
            sample: missingKeys.slice(0, 3),
          });
        }
        console.log('[sold-update] aggregate', {
          sessionId: session.id,
          totalKeys: aggregate.size,
          keys: Array.from(aggregate.keys()).slice(0, 10),
        });

        for (const [key, entry] of aggregate.entries()) {
          const qty = entry.qty;
          const updateResult = await env.DB.prepare(
            `
            UPDATE products
            SET
              quantity_available = CASE
                WHEN quantity_available IS NULL THEN 0
                WHEN quantity_available > ? THEN quantity_available - ?
                ELSE 0
              END,
              is_sold = CASE
                WHEN quantity_available IS NULL THEN 1
                WHEN quantity_available <= ? THEN 1
                ELSE is_sold
              END
            WHERE id = ? OR stripe_product_id = ? OR stripe_price_id = ?;
          `
          )
            .bind(qty, qty, qty, key, key, key)
            .run();

          if (!updateResult.success) {
            console.error('Failed to update product as sold', { key, error: updateResult.error });
          } else {
            const changes = updateResult.meta?.changes ?? 0;
            if (changes === 0) {
              console.warn('[sold-update] no product rows updated', {
                sessionId: session.id,
                key,
                qty,
                sources: Array.from(entry.sources),
              });
            }
            console.log('[sold-update] inventory update', {
              sessionId: session.id,
              key,
              qty,
              changes,
              sources: Array.from(entry.sources),
            });
          }
        }
      }

      const insertResult = await insertStandardOrderAndItems({
        db: env.DB,
        session: sessionWithLines,
        lineItemsForInsert: rawLineItems,
        paymentIntentId,
        customerEmail,
        shippingName,
        shippingAddress,
        cardLast4,
        cardBrand,
        shippingCents,
        totals: canonicalTotals,
        productId,
        quantityFromMeta,
      });

      const branch = 'standard';

      if (insertResult) {
        console.log('[stripe webhook] order insert complete', {
          sessionId: session.id,
          orderId: insertResult.orderId,
          displayOrderId: insertResult.displayOrderId,
          hasCustomerEmail: !!customerEmail,
          customerEmailSource,
        });
      }

      if (insertResult && !customerEmail) {
        console.warn('[stripe webhook] customer email missing; skipping confirmation email', {
          sessionId: session.id,
          orderId: insertResult.orderId,
          displayOrderId: insertResult.displayOrderId,
          customerEmailSource,
        });
      }

      if (insertResult && customerEmail && isPaid) {
      let baseEmailItems: Array<{ name: string; quantity: number; amountCents: number; imageUrl: string | null }> = [];
      try {
        baseEmailItems = await mapLineItemsToEmailItemsWithImages(
          env.DB,
          rawLineItems,
          session.currency || 'usd',
          siteUrl,
          env.PUBLIC_IMAGES_BASE_URL || null,
          emailDebug
        );
      } catch {
        baseEmailItems = [];
      }
      const confirmationItems: OrderConfirmationEmailItem[] = baseEmailItems.map((item) => ({
        name: item.name,
        qty: item.quantity,
        unitAmount:
          item.quantity && item.quantity > 0
            ? Math.round((item.amountCents || 0) / item.quantity)
            : item.amountCents || 0,
        lineTotal: item.amountCents || 0,
        imageUrl: item.imageUrl || undefined,
        optionGroupLabel: item.optionGroupLabel || null,
        optionValue: item.optionValue || null,
      }));

        const totalsForEmail = resolveEmailMoneyTotals({
          session,
          lineItems: rawLineItems,
        });
        console.log('[email totals raw]', {
          kind: 'shop_customer',
          orderId: insertResult.orderId,
          displayOrderId: insertResult.displayOrderId,
          subtotalCents: totalsForEmail.itemsSubtotalCents,
          shippingCents: totalsForEmail.shippingCents,
          taxCents: totalsForEmail.taxCents,
          discountCents: totalsForEmail.discountCents,
          totalCents: totalsForEmail.totalCents,
          shippingSource: totalsForEmail.shippingSource,
        });

        const confirmationUrl =
          siteUrl ? `${siteUrl}/checkout/return?session_id=${session.id}` : `/checkout/return?session_id=${session.id}`;
        const orderLabel = insertResult.displayOrderId || insertResult.orderId;
        logEmailBranch(emailDebug, {
          branch,
          orderLabel,
          hasCustomerEmail: !!customerEmail,
          hasOwnerTo: !!ownerTo,
        });
        const orderDate = formatOrderDate(new Date());
        const shippingAddressText = formatAddressForEmail(shippingAddress, shippingName);
        const billingAddressText = formatAddressForEmail(
          session.customer_details?.address || null,
          session.customer_details?.name || shippingName
        );
        const paymentMethodLabel = formatPaymentMethod(cardBrand, cardLast4);

        try {
          const html = renderOrderConfirmationEmailHtml({
            brandName: 'Dover Designs',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.itemsSubtotalCents,
            shipping: totalsForEmail.shippingCents,
            tax: totalsForEmail.taxCents,
            discount: totalsForEmail.discountCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });
          const text = renderOrderConfirmationEmailText({
            brandName: 'Dover Designs',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.itemsSubtotalCents,
            shipping: totalsForEmail.shippingCents,
            tax: totalsForEmail.taxCents,
            discount: totalsForEmail.discountCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });

        const subject = `Dover Designs - Order Confirmed (${orderLabel})`;
        const customerTo = isValidEmailRecipient(customerEmail) ? customerEmail : null;
        if (customerEmail && !customerTo) {
          warnInvalidRecipient('shop_customer', customerEmail);
        }
        logEmailPrepare(emailDebug, {
          kind: 'shop_customer',
          branch,
          orderLabel,
          subject,
          hasTo: !!customerTo,
          htmlLen: html?.length ?? 0,
          textLen: text?.length ?? 0,
        });
        if (emailDebug) {
          const preview = (html || '').replace(/\s+/g, ' ').slice(0, 300);
          console.log('[email] customer confirmation prepared', {
            kind: 'shop_customer',
            orderLabel,
            subject,
            preview,
            itemsCount: confirmationItems.length,
            hasInlineImage: hasUnsafeInlineImages(confirmationItems),
          });
        }
        
        if (customerTo) {
          const emailResult = await sendEmail(
            {
              to: customerTo,
              subject,
              html,
              text,
            },
            env
          );
          logEmailResult(emailDebug, {
            kind: 'shop_customer',
            branch,
            orderLabel,
            ok: emailResult.ok,
            error: emailResult.ok ? null : emailResult.error || 'unknown',
          });
          if (!emailResult.ok) {
            console.error('[stripe webhook] customer confirmation email failed', emailResult.error);
          }
        }
      } catch (emailError) {
        logEmailTemplateError(emailDebug, {
          kind: 'shop_customer',
          branch,
          orderLabel,
          err: String(emailError),
        });
        console.error('[stripe webhook] customer confirmation email error', emailError);
      }
    }

      if (!ownerTo) {
        console.warn('[stripe webhook] owner email missing; skipping receipt email', {
          sessionId: session.id,
          orderId: insertResult?.orderId,
        });
      }

      if (insertResult && isPaid && !invoiceId && !customOrderId && !customSource) {
        const orderLabel = insertResult.displayOrderId || insertResult.orderId;
        let confirmationItemsSource: Array<{ name: string; quantity: number; amountCents: number; imageUrl: string | null }> = [];
        try {
          confirmationItemsSource = await mapLineItemsToEmailItemsWithImages(
            env.DB,
            rawLineItems,
            session.currency || 'usd',
            siteUrl,
            env.PUBLIC_IMAGES_BASE_URL || null,
            emailDebug
          );
        } catch {
          confirmationItemsSource = [];
        }
        const confirmationItems: OwnerNewSaleItem[] = confirmationItemsSource.map((item) => ({
          name: item.name,
          qtyLabel: item.quantity > 1 ? `x${item.quantity}` : '',
          lineTotal: formatMoney(item.amountCents),
          imageUrl: item.imageUrl || undefined,
          optionGroupLabel: item.optionGroupLabel || null,
          optionValue: item.optionValue || null,
        }));

        const totalsForEmail = resolveEmailMoneyTotals({
          session,
          lineItems: rawLineItems,
        });
        console.log('[email totals raw]', {
          kind: 'shop_owner',
          orderId: insertResult.orderId,
          displayOrderId: insertResult.displayOrderId,
          subtotalCents: totalsForEmail.itemsSubtotalCents,
          shippingCents: totalsForEmail.shippingCents,
          taxCents: totalsForEmail.taxCents,
          discountCents: totalsForEmail.discountCents,
          totalCents: totalsForEmail.totalCents,
          shippingSource: totalsForEmail.shippingSource,
        });
        const totals = {
          subtotal: formatMoney(totalsForEmail.itemsSubtotalCents),
          shipping: formatShippingMoney(totalsForEmail.shippingCents),
          tax: formatMoney(totalsForEmail.taxCents),
          discount: totalsForEmail.discountCents > 0 ? formatMoney(totalsForEmail.discountCents) : null,
          total: formatMoney(totalsForEmail.totalCents),
        };
        const adminUrl = siteUrl ? `${siteUrl}/admin` : '/admin';
        const stripeUrl = buildStripeDashboardUrl(paymentIntentId, session.id, env.STRIPE_SECRET_KEY);
        const shippingAddressText = formatAddressForEmail(shippingAddress, shippingName);
        const billingAddressText = formatAddressForEmail(
          session.customer_details?.address || null,
          session.customer_details?.name || shippingName
        );
        const paymentMethodLabel = formatPaymentMethod(cardBrand, cardLast4);
        const orderDate = formatOrderDate(new Date());

        try {
          const html = renderOwnerNewSaleEmailHtml({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            tax: totals.tax,
            discount: totals.discount,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });
          const text = renderOwnerNewSaleEmailText({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            tax: totals.tax,
            discount: totals.discount,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });

          const ownerSubject = `NEW SALE - Dover Designs (${orderLabel})`;
        const ownerRecipient = isValidEmailRecipient(ownerTo) ? ownerTo : null;
        if (ownerTo && !ownerRecipient) {
          warnInvalidRecipient('shop_owner', ownerTo);
        }
        logEmailPrepare(emailDebug, {
          kind: 'shop_owner',
          branch,
          orderLabel,
          subject: ownerSubject,
          hasTo: !!ownerRecipient,
          htmlLen: html?.length ?? 0,
          textLen: text?.length ?? 0,
        });
        if (ownerRecipient) {
          const emailResult = await sendEmail(
            {
              to: ownerRecipient,
              subject: ownerSubject,
              html,
              text,
            },
            env
            );
            logEmailResult(emailDebug, {
              kind: 'shop_owner',
              branch,
              orderLabel,
              ok: emailResult.ok,
              error: emailResult.ok ? null : emailResult.error || 'unknown',
            });
            if (!emailResult.ok) {
              console.error('[stripe webhook] owner receipt email failed', emailResult.error);
            }
          }
        } catch (emailError) {
          console.error('[stripe webhook] owner receipt email error', emailError);
        }
      }
        break;
      }
      case 'checkout.session.expired': {
        const sessionId = (event.data.object as { id?: string | null })?.id ?? null;
        console.log('[stripe webhook] checkout.session.expired', { eventId: event.id, sessionId });
        return ok();
      }
      case 'payment_intent.succeeded': {
        const paymentIntentId = (event.data.object as { id?: string | null })?.id ?? null;
        console.log('[stripe webhook] payment_intent.succeeded', { eventId: event.id, paymentIntentId });
        return ok();
      }
      case 'payment_intent.payment_failed': {
        const paymentIntentId = (event.data.object as { id?: string | null })?.id ?? null;
        console.log('[stripe webhook] payment_intent.payment_failed', { eventId: event.id, paymentIntentId });
        return ok();
      }
      default: {
        console.log('[stripe webhook] ignored event type', { eventType: event.type, eventId: event.id });
        return ok();
      }
    }

    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('[stripe webhook] fatal', {
      type: event?.type,
      id: event?.id,
      err: String(error),
      stack: (error as any)?.stack,
    });
    return new Response('Webhook handling failed', { status: 500 });
  }
};

async function ensureOrdersSchema(db: D1Database) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      display_order_id TEXT,
      order_type TEXT,
      stripe_payment_intent_id TEXT,
      total_cents INTEGER,
      amount_total_cents INTEGER,
      amount_subtotal_cents INTEGER,
      amount_shipping_cents INTEGER,
      amount_tax_cents INTEGER,
      amount_discount_cents INTEGER,
      currency TEXT,
      customer_email TEXT,
      shipping_name TEXT,
      shipping_address_json TEXT,
      card_last4 TEXT,
      card_brand TEXT,
      description TEXT,
      shipping_cents INTEGER DEFAULT 0,
      is_seen INTEGER NOT NULL DEFAULT 0,
      seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`).run();

    await db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT,
    product_id TEXT,
    quantity INTEGER,
    price_cents INTEGER,
    image_url TEXT,
    option_group_label TEXT,
    option_value TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS order_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = (columns.results || []).map((c) => c.name);
  const addColumnIfMissing = async (name: string, ddl: string) => {
    if (!columnNames.includes(name)) {
      await db.prepare(ddl).run();
    }
  };

    await addColumnIfMissing('display_order_id', `ALTER TABLE orders ADD COLUMN display_order_id TEXT;`);
    await addColumnIfMissing('order_type', `ALTER TABLE orders ADD COLUMN order_type TEXT;`);
    await addColumnIfMissing('amount_total_cents', `ALTER TABLE orders ADD COLUMN amount_total_cents INTEGER;`);
    await addColumnIfMissing('amount_subtotal_cents', `ALTER TABLE orders ADD COLUMN amount_subtotal_cents INTEGER;`);
    await addColumnIfMissing('amount_shipping_cents', `ALTER TABLE orders ADD COLUMN amount_shipping_cents INTEGER;`);
    await addColumnIfMissing('amount_tax_cents', `ALTER TABLE orders ADD COLUMN amount_tax_cents INTEGER;`);
    await addColumnIfMissing('amount_discount_cents', `ALTER TABLE orders ADD COLUMN amount_discount_cents INTEGER;`);
    await addColumnIfMissing('currency', `ALTER TABLE orders ADD COLUMN currency TEXT;`);
    await addColumnIfMissing('description', `ALTER TABLE orders ADD COLUMN description TEXT;`);
    await addColumnIfMissing('shipping_cents', `ALTER TABLE orders ADD COLUMN shipping_cents INTEGER DEFAULT 0;`);
    await addColumnIfMissing('is_seen', `ALTER TABLE orders ADD COLUMN is_seen INTEGER NOT NULL DEFAULT 0;`);
    await addColumnIfMissing('seen_at', `ALTER TABLE orders ADD COLUMN seen_at TEXT;`);

  const itemColumns = await db.prepare(`PRAGMA table_info(order_items);`).all<{ name: string }>();
  const itemNames = (itemColumns.results || []).map((c) => c.name);
  if (!itemNames.includes('image_url')) {
    await db.prepare(`ALTER TABLE order_items ADD COLUMN image_url TEXT;`).run();
  }
  if (!itemNames.includes('option_group_label')) {
    await db.prepare(`ALTER TABLE order_items ADD COLUMN option_group_label TEXT;`).run();
  }
  if (!itemNames.includes('option_value')) {
    await db.prepare(`ALTER TABLE order_items ADD COLUMN option_value TEXT;`).run();
  }

  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_order_id ON orders(display_order_id);`
    )
    .run();

  await backfillDisplayOrderIds(db);
}

async function generateDisplayOrderId(db: D1Database): Promise<string> {
  const yearFull = new Date().getFullYear();
  const yy = yearFull % 100;
  let counter = 1;
  try {
    const counterRow = await db
      .prepare(
        `INSERT INTO order_counters (year, counter)
         VALUES (?, 1)
         ON CONFLICT(year) DO UPDATE SET counter = counter + 1
         RETURNING counter;`
      )
      .bind(yearFull)
      .first<{ counter: number }>();

    if (!counterRow || typeof counterRow.counter !== 'number') {
      throw new Error('counter missing');
    }
    counter = counterRow.counter;
  } catch (err) {
    console.error('[stripe webhook] counter upsert failed, falling back', err);
    const existing = await db
      .prepare(`SELECT counter FROM order_counters WHERE year = ?`)
      .bind(yearFull)
      .first<{ counter: number }>();
    counter = existing?.counter ? existing.counter + 1 : 1;
    const res = existing
      ? await db.prepare(`UPDATE order_counters SET counter = ? WHERE year = ?`).bind(counter, yearFull).run()
      : await db.prepare(`INSERT INTO order_counters (year, counter) VALUES (?, ?)`).bind(yearFull, counter).run();
    if (!res.success) {
      throw new Error('Failed to update order counter');
    }
  }

  const padded = String(counter).padStart(3, '0');
  return `${yy}-${padded}`;
}

async function assertOrdersTables(db: D1Database) {
  const tables = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders','order_items','order_counters');`
    )
    .all<{ name: string }>();
  const existing = new Set((tables.results || []).map((t) => t.name));
  const missing = ['orders', 'order_items', 'order_counters'].filter((t) => !existing.has(t));
  if (missing.length) {
    const message = `Missing required tables: ${missing.join(', ')}`;
    console.error('[stripe webhook] schema missing', message);
    throw new Error(message);
  }
}

async function ensureShippingColumn(db: D1Database) {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = new Set((columns.results || []).map((c) => c.name));
  if (!columnNames.has('shipping_cents')) {
    try {
      await db.prepare(`ALTER TABLE orders ADD COLUMN shipping_cents INTEGER DEFAULT 0;`).run();
      console.log('[stripe webhook] added shipping_cents column to orders');
    } catch (err) {
      console.error('[stripe webhook] failed to add shipping_cents column', err);
      // Continue; insert attempts will surface errors if column truly missing.
    }
  }
}

async function handleCustomInvoicePayment(args: {
  db: D1Database;
  env: Env;
  session: Stripe.Checkout.Session;
  lineItems: Stripe.LineItem[];
  paymentIntentId: string | null;
  totals: CanonicalTotals;
  customerEmail: string | null;
  isPaid: boolean;
}) {
  const { db, env, session, lineItems, paymentIntentId, totals, customerEmail, isPaid } = args;
  const emailDebug = env.EMAIL_DEBUG === '1' || (env as any).DEBUG_EMAILS === '1';
  const branch = 'custom_invoice';
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;
  if (!isPaid) {
    console.log('[custom invoice] payment pending; waiting for async success', {
      sessionId: session.id,
      invoiceId,
    });
    return;
  }

  // Update invoice status
  const now = new Date().toISOString();
  const update = await db
    .prepare(
      `UPDATE custom_invoices
       SET status = 'paid',
           paid_at = ?,
           stripe_payment_intent_id = ?
       WHERE id = ?;`
    )
    .bind(now, paymentIntentId, invoiceId)
    .run();

  if (!update.success) {
    console.error('[webhooks] Failed to mark custom invoice paid', update.error);
  }

  // Insert order record (must succeed to return 200)
  await ensureOrdersSchema(db);
  const orderId = crypto.randomUUID();
  const displayOrderId = await generateDisplayOrderId(db);
  const description = session.metadata?.description || 'Custom invoice payment';
  const amountCents = totals.amountTotal ?? 0;
  const email = customerEmail || session.customer_details?.email || null;
  const shippingCents = totals.amountShipping ?? 0;
  const subtotalCents = totals.amountSubtotal ?? amountCents;
  const currency = totals.currency || 'usd';

  await ensureShippingColumn(db);
  let inserted = await db
    .prepare(
      `INSERT INTO orders (
        id, display_order_id, order_type, stripe_payment_intent_id, total_cents, amount_total_cents, amount_subtotal_cents, amount_shipping_cents, amount_tax_cents, amount_discount_cents, currency, customer_email, shipping_name, shipping_address_json, card_last4, card_brand, description, shipping_cents
      ) VALUES (
        ?, ?, 'custom', ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, NULL, NULL, NULL, NULL, ?, ?
      );`
    )
    .bind(
      orderId,
      displayOrderId,
      paymentIntentId,
      amountCents,
      totals.amountTotal,
      totals.amountSubtotal,
      shippingCents,
      totals.amountTax,
      totals.amountDiscount,
      currency,
      email,
      description,
      shippingCents
    )
    .run();

  if (!inserted.success && inserted.error?.includes('no such column')) {
    inserted = await db
      .prepare(
        `INSERT INTO orders (
          id, display_order_id, stripe_payment_intent_id, total_cents, amount_total_cents, amount_subtotal_cents, amount_shipping_cents, amount_tax_cents, amount_discount_cents, currency, customer_email, shipping_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
      )
      .bind(
        orderId,
        displayOrderId,
        paymentIntentId,
        amountCents,
        totals.amountTotal,
        totals.amountSubtotal,
        shippingCents,
        totals.amountTax,
        totals.amountDiscount,
        currency,
        email,
        shippingCents
      )
      .run();
  }

  if (!inserted.success) {
    throw new Error('[webhooks] Failed to insert custom order record');
  }

  // Send emails (best effort)
  const orderLabel = displayOrderId || invoiceId;
  const invoiceAmount = formatAmount(amountCents, currency);
  const siteUrl = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const invoiceLink = siteUrl ? `${siteUrl}/invoice/${invoiceId}` : `/invoice/${invoiceId}`;
  const adminUrl = siteUrl ? `${siteUrl}/admin` : '/admin';
  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO;

  logEmailBranch(emailDebug, {
    branch,
    orderLabel,
    hasCustomerEmail: !!customerEmail,
    hasOwnerTo: !!ownerTo,
  });

  if (customerEmail) {
    try {
      const subject = 'Payment received - Dover Designs';
      const html = `
            <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; padding: 12px; line-height: 1.5;">
              <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 700;">Thank you for your payment</h2>
              <p style="margin: 0 0 8px;">We received your payment for invoice ${invoiceId}.</p>
              <p style="margin: 0 0 12px; font-weight: 600;">Amount: ${invoiceAmount}</p>
              <p style="margin: 0 0 12px;">You can revisit your invoice here: <a href="${invoiceLink}" style="color:#0f172a;">${invoiceLink}</a></p>
            </div>
          `;
      const text = `Thank you for your payment.\nInvoice: ${invoiceId}\nAmount: ${invoiceAmount}\nView invoice: ${invoiceLink}`;
      logEmailPrepare(emailDebug, {
        kind: 'custom_invoice_customer',
        branch,
        orderLabel,
        subject,
        hasTo: !!customerEmail,
        htmlLen: html.length,
        textLen: text.length,
      });
      const emailResult = await sendEmail(
        {
          to: customerEmail,
          subject,
          html,
          text,
        },
        env
      );
      logEmailResult(emailDebug, {
        kind: 'custom_invoice_customer',
        branch,
        orderLabel,
        ok: emailResult.ok,
        error: emailResult.ok ? null : emailResult.error || 'unknown',
      });
      if (!emailResult.ok) {
        console.error('[custom invoice] customer email failed', emailResult.error);
      }
    } catch (emailError) {
      console.error('[custom invoice] customer email error', emailError);
    }
  }

  if (!ownerTo) {
    console.warn('[custom invoice] owner email missing; skipping receipt email');
  }

  const emailItems: EmailItem[] =
    (lineItems || [])
      .filter((line) => {
        const desc = line.description || (line.price as any)?.product_data?.name || '';
        return !desc.toLowerCase().includes('shipping');
      })
      .map((line) => {
        const name =
          line.description ||
          (line.price?.product && typeof line.price.product !== 'string'
            ? (line.price.product as Stripe.Product).name
            : null) ||
          'Invoice item';
        const imageUrl =
          (line.price?.product && typeof line.price.product !== 'string'
            ? (line.price.product as Stripe.Product).images?.[0]
            : null) ||
          (line.price as any)?.product_data?.images?.[0] ||
          null;
        return {
          name,
          quantity: line.quantity ?? 1,
          amountCents: line.amount_subtotal ?? line.amount_total ?? 0,
          imageUrl,
        } as EmailItem;
      });

  if (!emailItems.length) {
    emailItems.push({
      name: description || 'Invoice payment',
      quantity: 1,
      amountCents: subtotalCents || amountCents,
      imageUrl: null,
    });
  }

  const emailPayload = renderOwnerInvoicePaidEmail({
    invoiceId,
    orderLabel: orderLabel,
    customerName: session.customer_details?.name || null,
    customerEmail: customerEmail || null,
    shippingAddress: session.shipping_details || null,
    items: emailItems,
    amounts: {
      subtotalCents,
      shippingCents,
      totalCents: amountCents,
      currency,
    },
    createdAtIso: now,
    adminUrl: adminUrl || undefined,
    description,
  });

  try {
    logEmailPrepare(emailDebug, {
      kind: 'custom_invoice_owner',
      branch,
      orderLabel,
      subject: emailPayload.subject,
      hasTo: !!ownerTo,
      htmlLen: emailPayload.html?.length ?? 0,
      textLen: emailPayload.text?.length ?? 0,
    });
    if (ownerTo) {
      const emailResult = await sendEmail(
        {
          to: ownerTo,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        },
        env
      );
      logEmailResult(emailDebug, {
        kind: 'custom_invoice_owner',
        branch,
        orderLabel,
        ok: emailResult.ok,
        error: emailResult.ok ? null : emailResult.error || 'unknown',
      });
      if (!emailResult.ok) {
        console.error('[custom invoice] owner email failed', emailResult.error);
      }
    }
  } catch (emailError) {
    console.error('[custom invoice] owner email error', emailError);
  }
}

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format((amountCents || 0) / 100);
  } catch {
    return `$${((amountCents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

async function backfillDisplayOrderIds(db: D1Database) {
  const missing = await db
    .prepare(
      `SELECT id, created_at FROM orders WHERE display_order_id IS NULL OR display_order_id = '' ORDER BY datetime(created_at) ASC`
    )
    .all<{ id: string; created_at: string }>();

  const rows = missing.results || [];
  if (!rows.length) return;

  const countersByYear = new Map<number, number>();
  const existingCounters = await db.prepare(`SELECT year, counter FROM order_counters`).all<{ year: number; counter: number }>();
  (existingCounters.results || []).forEach((row) => countersByYear.set(row.year, row.counter));

  await db.prepare('BEGIN IMMEDIATE TRANSACTION;').run();
  try {
    for (const row of rows) {
      const yearFull = row.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear();
      const year = yearFull % 100;
      const current = countersByYear.get(year) ?? 0;
      const next = current + 1;
      countersByYear.set(year, next);
      const padded = String(next).padStart(3, '0');
      const displayId = `${year}-${padded}`;

      await db.prepare(`UPDATE orders SET display_order_id = ? WHERE id = ?`).bind(displayId, row.id).run();
    }

    for (const [year, counter] of countersByYear.entries()) {
      const existing = await db
        .prepare(`SELECT counter FROM order_counters WHERE year = ?`)
        .bind(year)
        .first<{ counter: number }>();
      if (existing) {
        await db.prepare(`UPDATE order_counters SET counter = ? WHERE year = ?`).bind(counter, year).run();
      } else {
        await db.prepare(`INSERT INTO order_counters (year, counter) VALUES (?, ?)`).bind(year, counter).run();
      }
    }

    await db.prepare('COMMIT;').run();
  } catch (error) {
    console.error('Failed to backfill display order ids', error);
    await db.prepare('ROLLBACK;').run();
    throw error;
  }
}

async function ensureCustomOrdersSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_orders (
    id TEXT PRIMARY KEY,
    display_custom_order_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    description TEXT,
    image_url TEXT,
    image_id TEXT,
    image_storage_key TEXT,
    amount INTEGER,
    shipping_cents INTEGER NOT NULL DEFAULT 0,
    show_on_sold_products INTEGER NOT NULL DEFAULT 0,
    message_id TEXT,
    status TEXT DEFAULT 'pending',
    payment_link TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((c) => c.name);
  if (!names.includes('display_custom_order_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN display_custom_order_id TEXT;`).run();
  }
  if (!names.includes('stripe_session_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN stripe_session_id TEXT;`).run();
  }
  if (!names.includes('stripe_payment_intent_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN stripe_payment_intent_id TEXT;`).run();
  }
  if (!names.includes('paid_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN paid_at TEXT;`).run();
  }
  if (!names.includes('image_url')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN image_url TEXT;`).run();
  }
  if (!names.includes('image_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN image_id TEXT;`).run();
  }
  if (!names.includes('image_storage_key')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN image_storage_key TEXT;`).run();
  }
  if (!names.includes('shipping_cents')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN shipping_cents INTEGER NOT NULL DEFAULT 0;`).run();
  }
  if (!names.includes('show_on_sold_products')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN show_on_sold_products INTEGER NOT NULL DEFAULT 0;`).run();
  }
  if (!names.includes('archived')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`).run();
  }
  if (!names.includes('archived_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN archived_at TEXT;`).run();
  }
  const shippingCols = [
    'shipping_name',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_state',
    'shipping_postal_code',
    'shipping_country',
    'shipping_phone',
  ];
  for (const col of shippingCols) {
    if (!names.includes(col)) {
      try {
        await db.prepare(`ALTER TABLE custom_orders ADD COLUMN ${col} TEXT;`).run();
      } catch (err) {
        const msg = (err as any)?.message || '';
        if (!/duplicate column|already exists/i.test(msg)) {
          console.error('[webhooks] failed to add custom_orders column', { col, msg });
        }
      }
    }
  }
}

function mapLineItemsToEmailItems(lineItems: Stripe.LineItem[], currency: string): EmailItem[] {
  return filterNonShippingLineItems(lineItems).map((line) => {
    const productObj =
      line.price?.product && typeof line.price.product !== 'string'
        ? (line.price.product as Stripe.Product)
        : null;
    const name =
      line.description ||
      productObj?.name ||
      (line.price as any)?.product_data?.name ||
      'Item';
    const imageUrl =
      productObj?.images?.[0] ||
      (line.price as any)?.product_data?.images?.[0] ||
      null;
    return {
      name,
      quantity: line.quantity ?? 1,
      amountCents:
        line.amount_subtotal ??
        line.amount_total ??
        (line.price?.unit_amount ?? 0) * (line.quantity ?? 1),
      imageUrl,
    } as EmailItem;
  });
}

async function mapLineItemsToEmailItemsWithImages(
  db: D1Database,
  lineItems: Stripe.LineItem[],
  currency: string,
  siteUrl: string,
  imagesBaseUrl: string | null,
  debug = false
): Promise<EmailItem[]> {
  const items = filterNonShippingLineItems(lineItems).map((line) => {
    const productObj =
      line.price?.product && typeof line.price.product !== 'string'
        ? (line.price.product as Stripe.Product)
        : null;
    const meta = extractOptionMetadata(line);
    const productId =
      meta.sourceProductId ||
      (typeof line.price?.product === 'string'
        ? line.price.product
        : (line.price?.product as Stripe.Product | undefined)?.id || null);
    const name =
      line.description ||
      productObj?.name ||
      (line.price as any)?.product_data?.name ||
      'Item';
    const imageUrl =
      productObj?.images?.[0] ||
      (line.price as any)?.product_data?.images?.[0] ||
      null;
    return {
      name,
      quantity: line.quantity ?? 1,
      amountCents:
      line.amount_subtotal ??
        line.amount_total ??
        (line.price?.unit_amount ?? 0) * (line.quantity ?? 1),
      imageUrl,
      productId,
      optionGroupLabel: meta.optionGroupLabel,
      optionValue: meta.optionValue,
    };
  });

  const results: EmailItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    let imageUrl = item.imageUrl || null;
    if (!imageUrl && item.productId) {
      imageUrl = await resolveProductImageUrl(db, item.productId);
    }
    const finalImageUrl = resolveEmailImageUrl(imageUrl, siteUrl, imagesBaseUrl);
    if (debug && index === 0) {
      console.log('[email] item image', { name: item.name, raw: imageUrl, resolved: finalImageUrl });
    }
    results.push({
      name: item.name,
      quantity: item.quantity,
      amountCents: item.amountCents,
      imageUrl: finalImageUrl,
      optionGroupLabel: item.optionGroupLabel,
      optionValue: item.optionValue,
    });
  }

  return results;
}

async function handleCustomOrderPayment(args: {
  db: D1Database;
  env: Env;
  requestUrl?: string;
  session: Stripe.Checkout.Session;
  lineItems: Stripe.LineItem[];
  paymentIntentId: string | null;
  customerEmail: string | null;
  shippingName: string | null;
  shippingAddress: Stripe.Address | Stripe.ShippingAddress | null;
  cardLast4: string | null;
  cardBrand: string | null;
  shippingCents: number;
  totals: CanonicalTotals;
  isPaid: boolean;
}) {
  const {
    db,
    env,
    session,
    lineItems,
    paymentIntentId,
    customerEmail,
    shippingName,
    shippingAddress,
    cardLast4,
    cardBrand,
    shippingCents,
    totals,
    isPaid,
  } = args;
  const emailDebug = env.EMAIL_DEBUG === '1' || (env as any).DEBUG_EMAILS === '1';

  await ensureCustomOrdersSchema(db);
  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((c) => c.name);
  const emailCol = names.includes('customer_email')
    ? 'customer_email'
    : names.includes('customer_email1')
    ? 'customer_email1'
    : null;

  const customOrderId =
    session.metadata?.customOrderId ||
    session.metadata?.custom_order_id ||
    session.metadata?.customOrderID ||
    null;
  if (!customOrderId) {
    console.warn('[webhook][custom-order-email] missing customOrderId', {
      sessionId: session.id,
      eventType: 'checkout.session.completed',
      hasMetadata: !!session.metadata,
      metadataKeys: Object.keys(session.metadata || {}),
    });
    return;
  }

  const customOrder = await db
    .prepare(
      `SELECT id, display_custom_order_id, status, customer_name, ${
        emailCol ? `${emailCol} AS customer_email` : 'NULL AS customer_email'
      }, description, image_url, image_id, image_storage_key, amount, shipping_cents, payment_link, stripe_session_id, stripe_payment_intent_id,
         shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone
       FROM custom_orders WHERE id = ?`
    )
    .bind(customOrderId)
    .first<{
      id: string;
      display_custom_order_id: string | null;
      status?: string | null;
      customer_name: string | null;
      customer_email: string | null;
      description: string | null;
      image_url?: string | null;
      image_id?: string | null;
      image_storage_key?: string | null;
      amount: number | null;
      shipping_cents?: number | null;
      payment_link: string | null;
      stripe_session_id?: string | null;
      stripe_payment_intent_id?: string | null;
    }>();

  if (!customOrder) {
    console.warn('[webhook][custom-order-email] custom order not found', {
      sessionId: session.id,
      customOrderId,
    });
    return;
  }

  // Idempotent: if already marked paid, stop after ensuring order exists.
  const displayId = customOrder.display_custom_order_id || session.metadata?.customOrderDisplayId || customOrder.id;
  const existingOrder = await db
    .prepare(`SELECT id FROM orders WHERE stripe_payment_intent_id = ? OR display_order_id = ?`)
    .bind(paymentIntentId, displayId)
    .first<{ id: string }>();

  const amount = customOrder.amount ?? 0;
  const resolvedImage = await resolveCustomOrderEmailImage({
    imageUrl: customOrder.image_url || null,
    imageId: customOrder.image_id || null,
    imageStorageKey: customOrder.image_storage_key || null,
    requestUrl: args.requestUrl || null,
    env,
    db,
  });
  if (emailDebug) {
    console.log('[custom order email image]', {
      customOrderId,
      imageUrl: customOrder.image_url || null,
      imageId: customOrder.image_id || null,
      imageStorageKey: customOrder.image_storage_key || null,
      resolvedUrl: resolvedImage.url,
      source: resolvedImage.source,
    });
  }
  const baseShipping =
    Number.isFinite(customOrder.shipping_cents as number) && (customOrder.shipping_cents as number) >= 0
      ? Number(customOrder.shipping_cents)
      : 0;
  const resolvedShippingCents =
    totals.amountShipping > 0 ? totals.amountShipping : baseShipping;
  const totalCents = totals.amountTotal;
  const description = customOrder.description || 'Custom order payment';
  const shippingPhone =
    session.customer_details?.phone ||
    (session.shipping_details as any)?.phone ||
    null;

  console.log('[custom order] processing checkout.session.completed', {
    sessionId: session.id,
    paymentIntentId,
    customOrderId,
    displayId,
  });
  console.log('[webhook][custom-order-email] start', {
    sessionId: session.id,
    customOrderId,
    displayId,
    hasCustomerEmail: !!(customerEmail || customOrder.customer_email),
    hasOwnerTo: !!(env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO),
  });

  // Update custom order status and stripe ids
  const update = await db
    .prepare(
      isPaid
        ? `UPDATE custom_orders
           SET status = 'paid',
               stripe_payment_intent_id = ?,
               stripe_session_id = COALESCE(stripe_session_id, ?),
               paid_at = COALESCE(paid_at, ?),
               shipping_name = ?,
               shipping_line1 = ?,
               shipping_line2 = ?,
               shipping_city = ?,
               shipping_state = ?,
               shipping_postal_code = ?,
               shipping_country = ?,
               shipping_phone = ?
           WHERE id = ?`
        : `UPDATE custom_orders
           SET stripe_payment_intent_id = ?,
               stripe_session_id = COALESCE(stripe_session_id, ?),
               shipping_name = ?,
               shipping_line1 = ?,
               shipping_line2 = ?,
               shipping_city = ?,
               shipping_state = ?,
               shipping_postal_code = ?,
               shipping_country = ?,
               shipping_phone = ?
           WHERE id = ?`
    )
    .bind(
      paymentIntentId,
      session.id,
      ...(isPaid ? [new Date().toISOString()] : []),
      shippingName,
      shippingAddress?.line1 || null,
      shippingAddress?.line2 || null,
      shippingAddress?.city || null,
      shippingAddress?.state || null,
      shippingAddress?.postal_code || null,
      shippingAddress?.country || null,
      shippingPhone,
      customOrder.id
    )
    .run();
  if (!update.success) {
    console.error('[custom order] failed to update status', update.error);
  }

  if (!isPaid) {
    console.log('[custom order] payment pending; waiting for async success', {
      sessionId: session.id,
      customOrderId,
    });
    return;
  }

  const alreadyPaid = customOrder.status === 'paid';
  if (alreadyPaid || existingOrder) {
    console.log('[custom order] already processed', { displayId, existingOrder: existingOrder?.id });
    console.log('[webhook][custom-order-email] skip already processed', {
      sessionId: session.id,
      customOrderId,
      displayId,
      hasExistingOrder: !!existingOrder,
      hasPaymentIntentId: !!customOrder.stripe_payment_intent_id,
    });
    return;
  }

  // Insert into orders/order_items if not already present
  const insertResult = await insertStandardOrderAndItems({
    db,
    session,
    lineItemsForInsert: lineItems,
    paymentIntentId,
    customerEmail: customerEmail || customOrder.customer_email,
    shippingName,
    shippingAddress,
    cardLast4,
    cardBrand,
    shippingCents: resolvedShippingCents,
    totals,
    productId: null,
    quantityFromMeta: 1,
    displayOrderIdOverride: displayId,
    orderType: 'custom',
    description,
    lineItemsOverride: [
      {
        productId: `custom_order:${customOrder.id}`,
        quantity: 1,
        priceCents: amount,
        imageUrl: customOrder.image_url || null,
      },
    ],
    totalCentsOverride: totals.amountTotal,
  });

  const confirmationCustomerEmail = customerEmail || customOrder.customer_email || null;
  const orderLabel = displayId || insertResult?.displayOrderId || insertResult?.orderId || displayId;
  const branch = 'custom_order';

  logEmailBranch(emailDebug, {
    branch,
    orderLabel,
    hasCustomerEmail: !!confirmationCustomerEmail,
    hasOwnerTo: !!(env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO),
  });

  if (insertResult && confirmationCustomerEmail && isPaid) {
    const siteUrlForConfirmation = resolveSiteUrl(env);
    const confirmationUrl = siteUrlForConfirmation
      ? `${siteUrlForConfirmation}/checkout/return?session_id=${session.id}`
      : `/checkout/return?session_id=${session.id}`;
    const orderDate = formatOrderDate(new Date());
    const shippingAddressText = formatAddressForEmail(shippingAddress, shippingName);
    const billingAddressText = formatAddressForEmail(
      session.customer_details?.address || null,
      session.customer_details?.name || shippingName
    );
    const paymentMethodLabel = formatPaymentMethod(cardBrand, cardLast4);
    const totalsForEmail = resolveEmailMoneyTotals({
      order: {
        amount_total_cents: totals.amountTotal,
        amount_subtotal_cents: totals.amountSubtotal,
        amount_shipping_cents: resolvedShippingCents,
        amount_tax_cents: totals.amountTax,
        amount_discount_cents: totals.amountDiscount,
      },
      session,
      lineItems,
    });
    console.log('[email totals raw]', {
      kind: 'custom_customer',
      orderId: insertResult.orderId,
      displayOrderId: insertResult.displayOrderId,
      subtotalCents: totalsForEmail.itemsSubtotalCents,
      shippingCents: totalsForEmail.shippingCents,
      taxCents: totalsForEmail.taxCents,
      discountCents: totalsForEmail.discountCents,
      totalCents: totalsForEmail.totalCents,
    });
    const confirmationItems: OrderConfirmationEmailItem[] = [
      {
        name: customOrder.description || 'Custom order',
        qty: 1,
        unitAmount: amount,
        lineTotal: amount,
        imageUrl: resolvedImage.url || null,
      },
    ];

    try {
      const html = renderOrderConfirmationEmailHtml({
        brandName: 'Dover Designs',
        orderNumber: orderLabel,
        orderDate,
        customerName: customOrder.customer_name || shippingName || session.customer_details?.name || null,
        customerEmail: confirmationCustomerEmail || undefined,
        shippingAddress: shippingAddressText || undefined,
        billingAddress: billingAddressText || undefined,
        paymentMethod: paymentMethodLabel,
        items: confirmationItems,
        subtotal: totalsForEmail.itemsSubtotalCents,
        shipping: totalsForEmail.shippingCents,
        tax: totalsForEmail.taxCents,
        discount: totalsForEmail.discountCents,
        total: totalsForEmail.totalCents,
        primaryCtaUrl: confirmationUrl,
        primaryCtaLabel: 'View Order Details',
      });
      const text = renderOrderConfirmationEmailText({
        brandName: 'Dover Designs',
        orderNumber: orderLabel,
        orderDate,
        customerName: customOrder.customer_name || shippingName || session.customer_details?.name || null,
        customerEmail: confirmationCustomerEmail || undefined,
        shippingAddress: shippingAddressText || undefined,
        billingAddress: billingAddressText || undefined,
        paymentMethod: paymentMethodLabel,
        items: confirmationItems,
        subtotal: totalsForEmail.itemsSubtotalCents,
        shipping: totalsForEmail.shippingCents,
        tax: totalsForEmail.taxCents,
        discount: totalsForEmail.discountCents,
        total: totalsForEmail.totalCents,
        primaryCtaUrl: confirmationUrl,
        primaryCtaLabel: 'View Order Details',
      });

      const subject = `Dover Designs - Order Confirmed (${orderLabel})`;
      const customerTo = isValidEmailRecipient(confirmationCustomerEmail) ? confirmationCustomerEmail : null;
      if (confirmationCustomerEmail && !customerTo) {
        warnInvalidRecipient('custom_customer', confirmationCustomerEmail);
      }
      logEmailPrepare(emailDebug, {
        kind: 'custom_customer',
        branch,
        orderLabel,
        subject,
        hasTo: !!customerTo,
        htmlLen: html?.length ?? 0,
        textLen: text?.length ?? 0,
      });
      if (emailDebug) {
        const preview = (html || '').replace(/\s+/g, ' ').slice(0, 300);
        console.log('[email] customer confirmation prepared', {
          kind: 'custom_customer',
          orderLabel,
          subject,
          preview,
        });
      }
      
      if (customerTo) {
        const emailResult = await sendEmail(
          {
            to: customerTo,
            subject,
            html,
            text,
          },
          env
        );
        logEmailResult(emailDebug, {
          kind: 'custom_customer',
          branch,
          orderLabel,
          ok: emailResult.ok,
          error: emailResult.ok ? null : emailResult.error || 'unknown',
        });
        if (!emailResult.ok) {
          console.error('[custom order] customer confirmation email failed', emailResult.error);
        }
        console.log('[webhook][custom-order-email] customer send result', {
          sessionId: session.id,
          customOrderId,
          ok: emailResult.ok,
        });
      }
    } catch (emailError) {
      logEmailTemplateError(emailDebug, {
        kind: 'custom_customer',
        branch,
        orderLabel,
        err: String(emailError),
      });
      console.error('[custom order] customer confirmation email error', emailError);
    }
  } else if (insertResult) {
    console.log('[webhook][custom-order-email] customer send skipped', {
      sessionId: session.id,
      customOrderId,
      hasCustomerEmail: !!confirmationCustomerEmail,
    });
  }

  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO;
  if (!ownerTo) {
    console.warn('[custom order] owner email missing; skipping receipt email');
    console.log('[webhook][custom-order-email] owner send skipped', {
      sessionId: session.id,
      customOrderId,
      hasOwnerTo: false,
    });
  }

  if (!insertResult) return;

  const adminLink = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '') + '/admin';
  const ownerItems: OwnerNewSaleItem[] = [
    {
      name: customOrder.description || 'Custom order',
      qtyLabel: '',
      lineTotal: formatMoney(amount),
      imageUrl: resolvedImage.url || null,
    },
  ];
  const totalsForOwner = resolveEmailMoneyTotals({
    order: {
      amount_total_cents: totals.amountTotal,
      amount_subtotal_cents: totals.amountSubtotal,
      amount_shipping_cents: resolvedShippingCents,
      amount_tax_cents: totals.amountTax,
      amount_discount_cents: totals.amountDiscount,
    },
    session,
    lineItems,
  });
  console.log('[email totals raw]', {
    kind: 'custom_owner',
    orderId: insertResult.orderId,
    displayOrderId: insertResult.displayOrderId,
    subtotalCents: totalsForOwner.itemsSubtotalCents,
    shippingCents: totalsForOwner.shippingCents,
    taxCents: totalsForOwner.taxCents,
    discountCents: totalsForOwner.discountCents,
    totalCents: totalsForOwner.totalCents,
  });
  const ownerTotals = {
    subtotal: formatMoney(totalsForOwner.itemsSubtotalCents),
    shipping: formatShippingMoney(totalsForOwner.shippingCents),
    tax: formatMoney(totalsForOwner.taxCents),
    discount: totalsForOwner.discountCents > 0 ? formatMoney(totalsForOwner.discountCents) : null,
    total: formatMoney(totalsForOwner.totalCents),
  };
  const shippingAddressText = formatAddressForEmail(shippingAddress, shippingName);
  const billingAddressText = formatAddressForEmail(
    session.customer_details?.address || null,
    session.customer_details?.name || shippingName
  );
  const paymentMethodLabel = formatPaymentMethod(cardBrand, cardLast4);
  const orderDate = formatOrderDate(new Date());
  const stripeUrl = buildStripeDashboardUrl(paymentIntentId, session.id, env.STRIPE_SECRET_KEY);

  try {
    const html = renderOwnerNewSaleEmailHtml({
      orderNumber: orderLabel,
      orderDate,
      orderTypeLabel: 'Custom Order',
      statusLabel: 'PAID',
      customerName: customOrder.customer_name || shippingName || session.customer_details?.name || 'Customer',
      customerEmail: customerEmail || customOrder.customer_email || '',
      shippingAddress: shippingAddressText || undefined,
      billingAddress: billingAddressText || undefined,
      paymentMethod: paymentMethodLabel,
      items: ownerItems,
      subtotal: ownerTotals.subtotal,
      shipping: ownerTotals.shipping,
      tax: ownerTotals.tax,
      discount: ownerTotals.discount,
      total: ownerTotals.total,
      adminUrl: adminLink || '/admin',
      stripeUrl,
    });
    const text = renderOwnerNewSaleEmailText({
      orderNumber: orderLabel,
      orderDate,
      orderTypeLabel: 'Custom Order',
      statusLabel: 'PAID',
      customerName: customOrder.customer_name || shippingName || session.customer_details?.name || 'Customer',
      customerEmail: customerEmail || customOrder.customer_email || '',
      shippingAddress: shippingAddressText || undefined,
      billingAddress: billingAddressText || undefined,
      paymentMethod: paymentMethodLabel,
      items: ownerItems,
      subtotal: ownerTotals.subtotal,
      shipping: ownerTotals.shipping,
      tax: ownerTotals.tax,
      discount: ownerTotals.discount,
      total: ownerTotals.total,
      adminUrl: adminLink || '/admin',
      stripeUrl,
    });

    const ownerSubject = `NEW SALE - Dover Designs (${orderLabel})`;
    const ownerRecipient = isValidEmailRecipient(ownerTo) ? ownerTo : null;
    if (ownerTo && !ownerRecipient) {
      warnInvalidRecipient('custom_owner', ownerTo);
    }
    logEmailPrepare(emailDebug, {
      kind: 'custom_owner',
      branch,
      orderLabel,
      subject: ownerSubject,
      hasTo: !!ownerRecipient,
      htmlLen: html?.length ?? 0,
      textLen: text?.length ?? 0,
    });
    if (ownerRecipient) {
      const emailResult = await sendEmail(
        {
          to: ownerRecipient,
          subject: ownerSubject,
          html,
          text,
        },
        env
      );
      logEmailResult(emailDebug, {
        kind: 'custom_owner',
        branch,
        orderLabel,
        ok: emailResult.ok,
        error: emailResult.ok ? null : emailResult.error || 'unknown',
      });
      if (!emailResult.ok) {
        console.error('[custom order] owner receipt email failed', emailResult.error);
      }
      console.log('[webhook][custom-order-email] owner send result', {
        sessionId: session.id,
        customOrderId,
        ok: emailResult.ok,
      });
    }
  } catch (emailError) {
    console.error('[custom order] owner receipt email error', emailError);
  }
}

async function insertStandardOrderAndItems(args: {
  db: D1Database;
  session: Stripe.Checkout.Session;
  lineItemsForInsert?: Stripe.LineItem[];
  paymentIntentId: string | null;
  customerEmail: string | null;
  shippingName: string | null;
  shippingAddress: Stripe.Address | Stripe.ShippingAddress | null;
  cardLast4: string | null;
  cardBrand: string | null;
  shippingCents: number;
  totals: CanonicalTotals;
  productId?: string | null;
  quantityFromMeta?: number;
  displayOrderIdOverride?: string | null;
  orderType?: string | null;
  description?: string | null;
  lineItemsOverride?: {
    productId: string;
    quantity: number;
    priceCents: number;
    imageUrl?: string | null;
    optionGroupLabel?: string | null;
    optionValue?: string | null;
  }[];
  totalCentsOverride?: number;
}): Promise<{ orderId: string; displayOrderId: string } | null> {
  const {
    db,
    session,
    paymentIntentId,
    customerEmail,
    shippingName,
    shippingAddress,
    cardLast4,
    cardBrand,
    shippingCents,
    totals,
    productId,
    quantityFromMeta,
    displayOrderIdOverride,
    orderType,
    description,
    lineItemsOverride,
    totalCentsOverride,
    lineItemsForInsert,
  } = args;

  if (paymentIntentId) {
    const existing = await db
      .prepare(`SELECT id, display_order_id FROM orders WHERE stripe_payment_intent_id = ? LIMIT 1`)
      .bind(paymentIntentId)
      .first<{ id: string; display_order_id: string | null }>();
    if (existing) {
      const displayOrderId = existing.display_order_id || existing.id;
      console.log('[stripe webhook] existing order found; retry mode', {
        paymentIntentId,
        orderId: existing.id,
        displayOrderId,
      });
      return { orderId: existing.id, displayOrderId };
    }
  }

  await ensureOrdersSchema(db);
  await ensureShippingColumn(db);

  const orderId = crypto.randomUUID();
  const displayOrderId = displayOrderIdOverride || (await generateDisplayOrderId(db));
  const amountTotalCents = totals.amountTotal ?? session.amount_total ?? 0;
  const amountSubtotalCents = totals.amountSubtotal ?? session.amount_subtotal ?? 0;
  const amountShippingCents = totals.amountShipping ?? shippingCents ?? 0;
  const amountTaxCents = totals.amountTax ?? (session.total_details as any)?.amount_tax ?? 0;
  const amountDiscountCents = totals.amountDiscount ?? (session.total_details as any)?.amount_discount ?? 0;
  const currency = totals.currency || session.currency || 'usd';
  const totalCents = totalCentsOverride ?? amountTotalCents;
  const promoCode = (session.metadata?.mv_promo_code || '').trim() || null;
  const promoPercentOff = parseInt(session.metadata?.mv_percent_off_applied || '0', 10) || 0;
  const promoFreeShipping = session.metadata?.mv_free_shipping_applied === '1' ? 1 : 0;
  const promoSource = (session.metadata?.mv_promo_source || '').trim() || null;

  console.log('[stripe webhook] inserting order', {
    sessionId: session.id,
    paymentIntentId,
    hasLineItems: !!lineItemsForInsert?.length,
    displayOrderId,
    orderType,
  });

  const insertWithCard = await db
    .prepare(
      `
        INSERT INTO orders (
          id, display_order_id, order_type, stripe_payment_intent_id, total_cents, amount_total_cents, amount_subtotal_cents, amount_shipping_cents, amount_tax_cents, amount_discount_cents, currency,
          customer_email, shipping_name, shipping_address_json, card_last4, card_brand, shipping_cents, description,
          promo_code, promo_percent_off, promo_free_shipping, promo_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `
    )
    .bind(
      orderId,
      displayOrderId,
      orderType ?? null,
      paymentIntentId,
      totalCents,
      amountTotalCents,
      amountSubtotalCents,
      amountShippingCents,
      amountTaxCents,
      amountDiscountCents,
      currency,
      customerEmail,
      shippingName,
      JSON.stringify(shippingAddress ?? null),
      cardLast4,
      cardBrand,
      shippingCents,
      description ?? null,
      promoCode,
      promoPercentOff,
      promoFreeShipping,
      promoSource
    )
    .run();

  let orderInsertSucceeded = insertWithCard.success;

  if (!insertWithCard.success && insertWithCard.error?.includes('no such column')) {
    const fallbackResult = await db
      .prepare(
        `
          INSERT INTO orders (
            id, display_order_id, stripe_payment_intent_id, total_cents, customer_email, shipping_name, shipping_address_json, shipping_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `
      )
      .bind(
        orderId,
        displayOrderId,
        paymentIntentId,
        totalCents,
        customerEmail,
        shippingName,
        JSON.stringify(shippingAddress ?? null),
        shippingCents
      )
      .run();
    orderInsertSucceeded = fallbackResult.success;
    console.log('[stripe webhook] order insert fallback', {
      orderId,
      displayOrderId,
      success: fallbackResult.success,
      error: fallbackResult.error,
    });
  }

  console.log('[stripe webhook] order insert result', {
    orderId,
    displayOrderId,
    success: orderInsertSucceeded,
    error: insertWithCard.error,
  });

  if (!orderInsertSucceeded) {
    throw new Error(`Order insert failed for session ${session.id}`);
  }

  const preparedLineItems = lineItemsOverride
    ? lineItemsOverride
      : await (async () => {
        const items: Array<{
          productId: string;
          quantity: number;
          priceCents: number;
          imageUrl?: string | null;
          optionGroupLabel?: string | null;
          optionValue?: string | null;
        }> = [];
        const lines = filterNonShippingLineItems(lineItemsForInsert || []);
        for (const line of lines) {
          const qty = line.quantity ?? 1;
          const priceCents = line.price?.unit_amount ?? 0;
          const productIdFromPrice =
            typeof line.price?.product === 'string'
              ? line.price.product
              : (line.price?.product as Stripe.Product | undefined)?.id;
          const meta = extractOptionMetadata(line);
          const resolvedProductId = meta.sourceProductId || productIdFromPrice || productId || line.price?.id || 'unknown';
          const productObj =
            line.price?.product && typeof line.price.product !== 'string'
              ? (line.price.product as Stripe.Product)
              : null;
          let imageUrl =
            productObj?.images?.[0] ||
            (line.price as any)?.product_data?.images?.[0] ||
            null;
          if (!imageUrl && resolvedProductId) {
            imageUrl = await resolveProductImageUrl(db, resolvedProductId as string);
          }
          items.push({
            productId: resolvedProductId as string,
            quantity: qty,
            priceCents,
            imageUrl,
            optionGroupLabel: meta.optionGroupLabel,
            optionValue: meta.optionValue,
          });
        }
        return items;
      })();

  if (preparedLineItems.length) {
    for (const li of preparedLineItems) {
      const itemId = crypto.randomUUID();
      const itemResult = await db
        .prepare(
          `
          INSERT INTO order_items (id, order_id, product_id, quantity, price_cents, image_url, option_group_label, option_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `
      )
      .bind(
        itemId,
        orderId,
        li.productId,
        li.quantity ?? 1,
        li.priceCents ?? 0,
        (li as any).imageUrl ?? null,
        (li as any).optionGroupLabel ?? null,
        (li as any).optionValue ?? null
      )
      .run();

      if (!itemResult.success) {
        console.error('Failed to insert order_items into D1', itemResult.error);
      }
    }
    console.log('[stripe webhook] inserted order and items', { orderId, displayOrderId, items: preparedLineItems.length });
  } else if (productId) {
    const itemId = crypto.randomUUID();
    const fallbackImageUrl = await resolveProductImageUrl(db, productId);
    const itemResult = await db
      .prepare(
        `
          INSERT INTO order_items (id, order_id, product_id, quantity, price_cents, image_url, option_group_label, option_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `
      )
      .bind(
        itemId,
        orderId,
        productId,
        quantityFromMeta || 1,
        session.amount_subtotal && (quantityFromMeta || 1) > 0
          ? Math.floor(session.amount_subtotal / (quantityFromMeta || 1))
          : 0,
        fallbackImageUrl,
        null,
        null
      )
      .run();

    if (!itemResult.success) {
      console.error('Failed to insert order_items into D1 (fallback)', itemResult.error);
    } else {
      console.log('[stripe webhook] inserted order with fallback item', { orderId, displayOrderId, productId });
    }
  } else {
    console.warn('[stripe webhook] no line items available to insert for session', { sessionId: session.id });
  }

  return { orderId, displayOrderId };
}

function formatOrderDate(date: Date): string {
  try {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return date.toISOString();
  }
}

function extractLineItemMetadata(line: Stripe.LineItem): Record<string, string> {
  const productObj =
    line.price?.product && typeof line.price.product !== 'string'
      ? (line.price.product as Stripe.Product)
      : null;
  return (productObj?.metadata || {}) as Record<string, string>;
}

function extractOptionMetadata(line: Stripe.LineItem): {
  optionGroupLabel: string | null;
  optionValue: string | null;
  sourceProductId: string | null;
} {
  const meta = extractLineItemMetadata(line);
  const rawLabel = meta?.option_group_label;
  const rawValue = meta?.option_value;
  const rawSource = meta?.dd_product_id;
  return {
    optionGroupLabel: typeof rawLabel === 'string' && rawLabel.trim().length ? rawLabel.trim() : null,
    optionValue: typeof rawValue === 'string' && rawValue.trim().length ? rawValue.trim() : null,
    sourceProductId: typeof rawSource === 'string' && rawSource.trim().length ? rawSource.trim() : null,
  };
}

function formatShippingAddress(address: Stripe.Address | Stripe.ShippingAddress | null): string {
  if (!address) return '';
  const parts = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

function formatAddressForEmail(
  address: Stripe.Address | Stripe.ShippingAddress | null,
  name?: string | null
): string {
  if (!address) return '';
  const parts = [
    name,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.join('\n');
}

function formatPaymentMethod(cardBrand: string | null, cardLast4: string | null): string {
  if (!cardLast4) return 'Card';
  const label = cardBrand ? titleCase(cardBrand) : 'Card';
  return `${label} ending in ${cardLast4}`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ')
    .trim();
}

async function resolveProductImageUrl(db: D1Database, productId: string): Promise<string | null> {
  if (!productId) return null;
  const row = await db
    .prepare(`SELECT image_url, image_urls_json FROM products WHERE stripe_product_id = ? OR id = ? LIMIT 1;`)
    .bind(productId, productId)
    .first<{ image_url: string | null; image_urls_json: string | null }>();
  if (!row) return null;
  if (row.image_url) return row.image_url;
  if (row.image_urls_json) {
    try {
      const parsed = JSON.parse(row.image_urls_json);
      if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    } catch {
      return null;
    }
  }
  return null;
}

function toAbsoluteUrl(url: string | null, siteUrl: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return siteUrl ? `${siteUrl}${url}` : url;
  return url;
}

function resolveEmailImageUrl(
  imageUrl: string | null,
  siteUrl: string,
  imagesBaseUrl: string | null
): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (trimmed.length > 1000) return null;
  if (/^(data|blob):/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return siteUrl ? `${siteUrl}${trimmed}` : null;
  if (!imagesBaseUrl) return null;
  const base = imagesBaseUrl.replace(/\/+$/, '');
  const key = trimmed.replace(/^\/+/, '');
  return `${base}/${key}`;
}

function hasUnsafeInlineImages(items: Array<{ imageUrl?: string | null }>): boolean {
  return items.some((item) => {
    const url = item.imageUrl || '';
    return /^(data|blob):/i.test(url);
  });
}

function resolveSiteUrl(env: {
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
}) {
  const raw = env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '';
  return raw ? raw.replace(/\/+$/, '') : '';
}

function formatShippingAddressLines(address: Stripe.Address | Stripe.ShippingAddress | null): {
  line1: string;
  line2: string;
} {
  if (!address) return { line1: '', line2: '' };
  const line1Parts = [address.name, address.line1].filter(Boolean).map((p) => (p || '').trim());
  const line2Parts = [
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .map((p) => (p || '').trim());
  return {
    line1: line1Parts.join(' - '),
    line2: line2Parts.join(', '),
  };
}

function buildStripeDashboardUrl(
  paymentIntentId: string | null,
  sessionId: string,
  stripeSecret?: string
): string {
  const isTest = stripeSecret ? stripeSecret.startsWith('sk_test') : false;
  const base = isTest ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
  if (paymentIntentId) return `${base}/payments/${paymentIntentId}`;
  return `${base}/checkout/sessions/${sessionId}`;
}
