import type Stripe from 'stripe';
import { resolveFromEmail, sendEmail } from '../../../../_lib/email';
import {
  renderCustomOrderPaymentLinkEmailHtml,
  renderCustomOrderPaymentLinkEmailText,
} from '../../../../_lib/customOrderPaymentLinkEmail';
import { resolveCustomOrderEmailImage } from '../../../../_lib/customOrderEmailImages';
import { requireAdmin } from '../../../_lib/adminAuth';
import { createCheckoutSession } from '../../../../_lib/stripeClient';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CustomOrderRow = {
  id: string;
  display_custom_order_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_email1?: string | null;
  description: string | null;
  image_url?: string | null;
  image_id?: string | null;
  image_storage_key?: string | null;
  amount: number | null;
  shipping_cents?: number | null;
  payment_link?: string | null;
  shipping_name?: string | null;
  shipping_line1?: string | null;
  shipping_line2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
  shipping_phone?: string | null;
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });

export async function onRequestPost(context: {
  env: {
    DB: D1Database;
    STRIPE_SECRET_KEY?: string;
    PUBLIC_SITE_URL?: string;
    VITE_PUBLIC_SITE_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM?: string;
    RESEND_FROM_EMAIL?: string;
    RESEND_REPLY_TO?: string;
    EMAIL_FROM?: string;
    DEBUG_EMAILS?: string;
  };
  params: Record<string, string>;
  request: Request;
}) {
  const { env, params } = context;
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;
  const id = params?.id;
  const debug = (env as any)?.DEBUG_CUSTOM_ORDERS === '1';
  const debugEmails = env.DEBUG_EMAILS === '1';
  const debugCustomOrderEmails = (env as any)?.DEBUG_CUSTOM_ORDER_EMAILS === '1';

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Failed to send payment link', detail: 'Missing STRIPE_SECRET_KEY' }, 500);
  }
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);

  const hasResend = !!env.RESEND_API_KEY;
  const fromEmail = resolveFromEmail(env);
  if (!hasResend) {
    return jsonResponse({ error: 'Failed to send payment link', detail: 'Missing RESEND_API_KEY' }, 500);
  }
  if (!fromEmail) {
    return jsonResponse({ error: 'Failed to send payment link', detail: 'Missing RESEND_FROM' }, 500);
  }

  try {
    await ensureCustomOrdersSchema(env.DB);
    const columns = await getCustomOrdersColumns(env.DB);
    const emailCol = columns.emailCol;

    const order = await env.DB.prepare(
      `SELECT id, display_custom_order_id, customer_name, ${
        emailCol ? `${emailCol} AS customer_email` : 'NULL AS customer_email'
      }, description, image_url, image_id, image_storage_key, amount, shipping_cents, payment_link,
      shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone
       FROM custom_orders WHERE id = ?`
    )
      .bind(id)
      .first<CustomOrderRow>();

    if (!order) return jsonResponse({ error: 'Not found' }, 404);
    const amount = order.amount ?? 0;
    if (!amount || amount <= 0) {
      return jsonResponse({ error: 'Custom order amount is missing or zero' }, 400);
    }
    const customerEmail = order.customer_email || order.customer_email1;
    if (!customerEmail) {
      return jsonResponse({ error: 'Custom order missing customer email' }, 400);
    }

    const baseUrl = resolveSiteUrl(env);
    if (!baseUrl) {
      return jsonResponse({ error: 'Missing PUBLIC_SITE_URL' }, 500);
    }

    const shippingCents =
      Number.isFinite(order.shipping_cents as number) && (order.shipping_cents as number) >= 0
        ? Number(order.shipping_cents)
        : 0;
    const subtotalCents = amount;
    const totalCents = subtotalCents + shippingCents;
    const displayId = order.display_custom_order_id || order.id;
    const resolvedImage = await resolveCustomOrderEmailImage({
      imageUrl: order.image_url || null,
      imageId: order.image_id || null,
      imageStorageKey: order.image_storage_key || null,
      requestUrl: baseUrl,
      env,
      db: env.DB,
    });
    if (debugEmails) {
      console.log('[custom-orders email image]', {
        customOrderId: order.id,
        imageUrl: order.image_url || null,
        imageId: order.image_id || null,
        imageStorageKey: order.image_storage_key || null,
        resolvedUrl: resolvedImage.url,
        source: resolvedImage.source,
      });
    }
    if (debug) {
      console.log('[custom-orders send-link] totals', {
        id,
        shippingCents,
        amount: amount,
      });
    }
    if (debugCustomOrderEmails || debugEmails) {
      console.log('[custom-orders payment-link totals]', {
        customOrderId: order.id,
        displayId,
        subtotalCents,
        shippingCents,
        totalCents,
      });
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Custom Order ${displayId}`,
            description: order.description || undefined,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ];
    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: 'Shipping',
          fixed_amount: {
            amount: shippingCents,
            currency: 'usd',
          },
        },
      },
    ];

    const session = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
      mode: 'payment',
      customer_email: customerEmail,
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      phone_number_collection: {
        enabled: true,
      },
      line_items: lineItems,
      shipping_options: shippingOptions,
      billing_address_collection: 'auto',
      automatic_tax: {
        enabled: true,
      },
      success_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/shop?customOrderCanceled=1&co=${encodeURIComponent(displayId)}`,
      metadata: {
        customOrderId: order.id,
        customOrderDisplayId: displayId,
        source: 'custom_order',
        kind: 'custom_order',
        shipping_cents: String(shippingCents),
      },
    });

    if (!session.url) {
      console.error('[custom-orders send-link] session missing url', { sessionId: session.id });
      return jsonResponse({ error: 'Failed to create payment link', detail: 'No session URL returned' }, 500);
    }

    const update = await env.DB.prepare(
      `UPDATE custom_orders SET payment_link = ?, stripe_session_id = ? WHERE id = ?`
    )
      .bind(session.url, session.id, id)
      .run();
    if (!update.success) {
      console.error('[custom-orders send-link] failed to save link', update.error);
      return jsonResponse({ error: 'Failed to save payment link', detail: update.error || 'unknown error' }, 500);
    }

    const html = renderCustomOrderPaymentLinkEmailHtml({
      brandName: 'Dover Designs',
      orderLabel: displayId,
      ctaUrl: session.url,
      amountCents: amount,
      currency: 'usd',
      subtotalCents,
      shippingCents,
      totalCents,
      thumbnailUrl: resolvedImage.url || null,
      description: order.description || null,
    });
    const text = renderCustomOrderPaymentLinkEmailText({
      brandName: 'Dover Designs',
      orderLabel: displayId,
      ctaUrl: session.url,
      amountCents: amount,
      currency: 'usd',
      subtotalCents,
      shippingCents,
      totalCents,
      thumbnailUrl: resolvedImage.url || null,
      description: order.description || null,
    });

    console.log('[email] custom order send', {
      to: customerEmail,
      subject: 'Dover Designs Custom Order Payment',
      hasHtml: !!html,
      htmlLen: html.length,
      hasText: !!text,
      textLen: text.length,
    });

    if (!html || html.length < 50) {
      throw new Error('Custom order email HTML missing or too short');
    }

    const emailResult = await sendEmail(
      {
        to: customerEmail,
        subject: 'Dover Designs Custom Order Payment',
        html,
        text,
      },
      env
    );

    if (!emailResult.ok) {
      console.error('[custom-orders send-link] email send failed', emailResult.error);
    }

    console.log('[custom-orders send-link] done', {
      customOrderId: order.id,
      displayId,
      sessionId: session.id,
      emailOk: emailResult.ok,
    });

    return jsonResponse({ success: true, paymentLink: session.url, sessionId: session.id, emailOk: emailResult.ok });
  } catch (err) {
    console.error('[custom-orders send-link] unexpected error', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to send payment link', detail: message }, 500);
  }
}

async function ensureCustomOrdersSchema(_db: D1Database) {
  return;
}

async function getCustomOrdersColumns(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const allColumns = (results || []).map((c) => c.name);
  const emailCol = allColumns.includes('customer_email')
    ? 'customer_email'
    : allColumns.includes('customer_email1')
    ? 'customer_email1'
    : null;
  return { allColumns, emailCol };
}

function resolveSiteUrl(env: {
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
}) {
  const raw = env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '';
  return raw ? raw.replace(/\/+$/, '') : '';
}


