import type Stripe from 'stripe';
import { isShippingLineItem } from '../../lib/shipping';
import { normalizeImageUrl } from '../../lib/images';
import { listCheckoutSessionLineItems, retrieveCheckoutSession } from '../../../_lib/stripeClient';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ProductRow = {
  id: string;
  name: string | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  image_url?: string | null;
  image_urls_json?: string | null;
  is_one_off?: number | null;
};

type CustomOrderRow = {
  id: string;
  image_url?: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const extractLineItemMetadata = (line: Stripe.LineItem): Record<string, string> => {
  const productObj =
    line.price?.product && typeof line.price.product !== 'string'
      ? (line.price.product as Stripe.Product)
      : null;
  const productMeta = (productObj?.metadata || {}) as Record<string, string>;
  const priceMeta = ((line.price as any)?.metadata || {}) as Record<string, string>;
  const productDataMeta = ((line.price as any)?.product_data?.metadata || {}) as Record<string, string>;
  const lineMeta = ((line as any)?.metadata || {}) as Record<string, string>;
  return {
    ...productMeta,
    ...productDataMeta,
    ...priceMeta,
    ...lineMeta,
  };
};

export const onRequestGet = async (context: {
  params: Record<string, string>;
  request: Request;
  env: { STRIPE_SECRET_KEY?: string; DB?: D1Database; PUBLIC_IMAGES_BASE_URL?: string };
}) => {
  const { params, env, request } = context;

  if (!env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return json({ error: 'Stripe is not configured' }, 500);
  }

  const sessionId = params?.id;
  if (!sessionId) {
    return json({ error: 'Missing session ID' }, 400);
  }

  try {
    const session = await retrieveCheckoutSession(env.STRIPE_SECRET_KEY, sessionId, {
      expand: [
        'payment_intent.payment_method',
        'payment_intent.charges.data.payment_method_details',
        'payment_intent.shipping',
      ],
    });
    const lineItemsResp = await listCheckoutSessionLineItems(env.STRIPE_SECRET_KEY, session.id, {
      limit: 100,
      expand: ['data.price.product'],
    });
    const lineItemsRaw = lineItemsResp.data || [];

    const paymentIntent =
      session.payment_intent && typeof session.payment_intent !== 'string'
        ? session.payment_intent
        : null;

    const customerAddress = session.customer_details?.address || null;

    const shippingDetails =
      (session.shipping_details as Stripe.Checkout.Session.ShippingDetails | null) ||
      paymentIntent?.shipping ||
      (customerAddress
        ? {
            name: session.customer_details?.name ?? null,
            address: customerAddress,
          }
        : null);

    const shippingName =
      (shippingDetails as any)?.name ?? session.customer_details?.name ?? null;
    const shippingAddress =
      (shippingDetails as any)?.address ?? customerAddress ?? null;

    const firstCharge = paymentIntent?.charges?.data?.[0];
    const pmd = firstCharge?.payment_method_details as any;
    const cardFromCharges = pmd?.card || null;
    const walletType = cardFromCharges?.wallet?.type ?? null;

    const cardFromPaymentMethod =
      paymentIntent?.payment_method && typeof paymentIntent.payment_method !== 'string'
        ? (paymentIntent.payment_method as Stripe.PaymentMethod).card
        : null;

    const cardLast4 = cardFromCharges?.last4 ?? cardFromPaymentMethod?.last4 ?? null;
    const cardBrand = cardFromCharges?.brand ?? cardFromPaymentMethod?.brand ?? null;
    const paymentMethodType =
      walletType ||
      pmd?.type ||
      (paymentIntent?.payment_method_types && paymentIntent.payment_method_types[0]) ||
      null;

    const labelMap: Record<string, string> = {
      card: 'Card',
      link: 'Link',
      amazon_pay: 'Amazon Pay',
      apple_pay: 'Apple Pay',
      google_pay: 'Google Pay',
      paypal: 'PayPal',
      klarna: 'Klarna',
      afterpay_clearpay: 'Afterpay',
      affirm: 'Affirm',
    };
    const paymentMethodLabel =
      paymentMethodType && labelMap[paymentMethodType]
        ? labelMap[paymentMethodType]
        : paymentMethodType
        ? paymentMethodType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : null;

    const customOrderId = session.metadata?.customOrderId || null;
    let customOrderImageUrl: string | null = null;
    if (customOrderId && env.DB) {
      try {
        const row = await env.DB.prepare(`SELECT id, image_url FROM custom_orders WHERE id = ?`)
          .bind(customOrderId)
          .first<CustomOrderRow>();
        customOrderImageUrl = row?.image_url || null;
      } catch (err) {
        console.error('Failed to load custom order image', err);
      }
    }

    const stripeProductIds = lineItemsRaw
      .map((li) => {
        const priceProduct = li.price?.product;
        if (typeof priceProduct === 'string') return priceProduct;
        if (priceProduct && typeof priceProduct === 'object') return (priceProduct as Stripe.Product).id;
        return null;
      })
      .filter(Boolean) as string[];

    const sourceProductIds = lineItemsRaw
      .map((li) => {
        const meta = extractLineItemMetadata(li);
        const source = meta?.dd_product_id;
        return typeof source === 'string' && source.trim().length > 0 ? source.trim() : null;
      })
      .filter(Boolean) as string[];

    const stripePriceIds = lineItemsRaw
      .map((li) => (li.price && typeof li.price.id === 'string' ? li.price.id : null))
      .filter(Boolean) as string[];

    const productLookup = new Map<string, ProductRow>();
    const nameLookup = new Map<string, ProductRow[]>();
    if (env.DB && (stripeProductIds.length || stripePriceIds.length || sourceProductIds.length)) {
      const placeholdersProd = stripeProductIds.map(() => '?').join(',');
      const placeholdersPrice = stripePriceIds.map(() => '?').join(',');
      const placeholdersSource = sourceProductIds.map(() => '?').join(',');
      const whereClauses = [];
      const bindValues: unknown[] = [];
      if (placeholdersProd) {
        whereClauses.push(`stripe_product_id IN (${placeholdersProd})`);
        bindValues.push(...stripeProductIds);
      }
      if (placeholdersPrice) {
        whereClauses.push(`stripe_price_id IN (${placeholdersPrice})`);
        bindValues.push(...stripePriceIds);
      }
      if (placeholdersSource) {
        whereClauses.push(`id IN (${placeholdersSource})`);
        bindValues.push(...sourceProductIds);
      }
      try {
        const query = `
          SELECT id, name, stripe_product_id, stripe_price_id, image_url, image_urls_json, is_one_off
          FROM products
          WHERE ${whereClauses.join(' OR ')};
        `;
        const { results } = await env.DB.prepare(query).bind(...bindValues).all<ProductRow>();
        (results || []).forEach((row) => {
          if (row.id) productLookup.set(row.id, row);
          if (row.stripe_product_id) productLookup.set(row.stripe_product_id, row);
          if (row.stripe_price_id) productLookup.set(row.stripe_price_id, row);
        });
      } catch (dbError) {
        console.error('Failed to lookup products for checkout session', dbError);
      }
    }

    if (env.DB) {
      const names = Array.from(
        new Set(
          lineItemsRaw
            .map((li) => li.description || '')
            .map((name) => name.trim())
            .filter(Boolean)
        )
      );
      if (names.length) {
        const placeholdersNames = names.map(() => '?').join(',');
        try {
          const { results } = await env.DB
            .prepare(
              `
              SELECT id, name, stripe_product_id, stripe_price_id, image_url, image_urls_json, is_one_off, price_cents
              FROM products
              WHERE name IN (${placeholdersNames});
            `
            )
            .bind(...names)
            .all<ProductRow & { price_cents?: number | null }>();
          (results || []).forEach((row) => {
            const key = (row.name || '').trim();
            if (!key) return;
            const list = nameLookup.get(key) || [];
            list.push(row);
            nameLookup.set(key, list);
          });
        } catch (dbError) {
          console.error('Failed to lookup products by name for checkout session', dbError);
        }
      }
    }

    const pickPrimaryImage = (row?: ProductRow | null): string | null => {
      if (!row) return null;
      if (row.image_url) return row.image_url;
      if (row.image_urls_json) {
        try {
          const parsed = JSON.parse(row.image_urls_json);
          if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'string') {
            return parsed[0];
          }
        } catch {
          // ignore parse errors
        }
      }
      return null;
    };
    const resolveLineItemImage = (
      line: Stripe.LineItem,
      matchedProduct: ProductRow | null,
      customOrderImage: string | null,
      isCustomOrder: boolean
    ) => {
      const productObj =
        line.price?.product && typeof line.price.product !== 'string'
          ? (line.price.product as Stripe.Product)
          : null;
      const stripeImage =
        productObj?.images?.[0] || (line.price as any)?.product_data?.images?.[0] || null;
      const raw = isCustomOrder ? customOrderImage : pickPrimaryImage(matchedProduct) || stripeImage;
      return raw ? normalizeImageUrl(raw, request, env) : null;
    };

    const toCents = (value: unknown) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
    const totalDetails = session.total_details as Stripe.Checkout.Session.TotalDetails | null;
    const amountTotal = toCents(session.amount_total);
    const amountSubtotal = toCents(session.amount_subtotal);
    const amountShipping = toCents(totalDetails?.amount_shipping);
    const amountTax = toCents(totalDetails?.amount_tax);
    const amountDiscount = toCents(totalDetails?.amount_discount);
    const lineItems =
      lineItemsRaw.map((li) => {
        const meta = extractLineItemMetadata(li);
        const optionGroupLabel =
          typeof meta?.option_group_label === 'string' && meta.option_group_label.trim().length
            ? meta.option_group_label.trim()
            : null;
        const optionValue =
          typeof meta?.option_value === 'string' && meta.option_value.trim().length
            ? meta.option_value.trim()
            : null;
        const sourceProductId =
          typeof meta?.dd_product_id === 'string' && meta.dd_product_id.trim().length
            ? meta.dd_product_id.trim()
            : null;
        const stripeProductId =
          typeof li.price?.product === 'string'
            ? li.price?.product
            : li.price?.product && typeof li.price.product === 'object'
            ? (li.price.product as Stripe.Product).id
            : null;
        const stripePriceId = typeof li.price?.id === 'string' ? li.price.id : null;
        const productName =
          (li.price?.product &&
            typeof li.price.product !== 'string' &&
            (li.price.product as Stripe.Product).name) ||
          li.description ||
          'Item';
        const quantity = li.quantity ?? 0;
        const unitAmount = li.price?.unit_amount ?? 0;
        const metaMatch = sourceProductId ? productLookup.get(sourceProductId) : null;
        const keyMatch = !metaMatch && stripeProductId ? productLookup.get(stripeProductId) : null;
        const priceMatch = !metaMatch && !keyMatch && stripePriceId ? productLookup.get(stripePriceId) : null;
        let matchedProduct = metaMatch || keyMatch || priceMatch || null;
        if (!matchedProduct && productName) {
          const candidates = nameLookup.get(productName) || [];
          if (candidates.length === 1) {
            matchedProduct = candidates[0];
          } else if (candidates.length > 1 && unitAmount != null) {
            matchedProduct = candidates.find((row: any) => row.price_cents === unitAmount) || candidates[0] || null;
          }
        }
        const isShipping = isShippingLineItem(li) && !matchedProduct;
        const isCustomOrder = /custom order/i.test(productName) && !matchedProduct;
        const lineSubtotal = li.amount_subtotal ?? unitAmount * quantity;
        const lineTotal = li.amount_total ?? lineSubtotal;
        return {
          productName,
          quantity,
          unitAmount,
          lineSubtotal,
          lineTotal,
          imageUrl: resolveLineItemImage(li, matchedProduct, customOrderImageUrl, isCustomOrder),
          image_url: resolveLineItemImage(li, matchedProduct, customOrderImageUrl, isCustomOrder),
          oneOff: matchedProduct ? matchedProduct.is_one_off === 1 : false,
          isShipping,
          stripeProductId: sourceProductId || stripeProductId,
          optionGroupLabel,
          optionValue,
        };
      }) ?? [];

    return json({
      id: session.id,
      amount_total: amountTotal,
      amount_subtotal: amountSubtotal,
      amount_shipping: amountShipping,
      amount_tax: amountTax,
      amount_discount: amountDiscount,
      currency: session.currency ?? 'usd',
      payment_status: session.payment_status ?? null,
      customer_email: session.customer_details?.email ?? paymentIntent?.receipt_email ?? null,
      payment_method_type: paymentMethodType,
      payment_method_label: paymentMethodLabel,
      shipping: shippingAddress
        ? {
            name: shippingName,
            address: shippingAddress,
          }
        : null,
      line_items: lineItems,
      shipping_amount: amountShipping,
      card_last4: cardLast4,
      card_brand: cardBrand,
    });
  } catch (error) {
    console.error('Error in checkout session endpoint', error);
    return json({ error: 'Failed to load checkout session' }, 500);
  }
};
