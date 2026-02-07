import type Stripe from 'stripe';
import { calculateShippingCents } from '../../_lib/shipping';
import { createCheckoutSession } from '../../_lib/stripeClient';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ProductRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  description: string | null;
  price_cents: number | null;
  category: string | null;
  image_url: string | null;
  image_urls_json?: string | null;
  is_active: number | null;
  is_one_off?: number | null;
  is_sold?: number | null;
  quantity_available?: number | null;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  collection?: string | null;
  created_at: string | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
  slug: string | null;
  shipping_cents?: number | null;
  option_group_label?: string | null;
  option_group_options_json?: string | null;
};

type PromotionRow = {
  id: string;
  name: string | null;
  percent_off: number | null;
  scope: 'global' | 'categories' | string | null;
  category_slugs_json: string | null;
  banner_enabled: number | null;
  banner_text: string | null;
  starts_at: string | null;
  ends_at: string | null;
  enabled: number | null;
  updated_at: string | null;
};

type PromoCodeRow = {
  id: string;
  code: string | null;
  enabled: number | null;
  percent_off: number | null;
  free_shipping: number | null;
  scope: 'global' | 'categories' | string | null;
  category_slugs_json: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeOrigin = (request: Request) => {
  const url = new URL(request.url);
  const originHeader = request.headers.get('origin');
  const origin = originHeader && originHeader.startsWith('http') ? originHeader : `${url.protocol}//${url.host}`;
  return origin.replace(/\/$/, '');
};

const normalizeSiteUrl = (value?: string | null) =>
  value ? value.trim().replace(/\/+$/, '') : '';

const resolveCheckoutOrigin = (envValue: string | undefined, request: Request): string => {
  const raw = typeof envValue === 'string' ? envValue.trim().replace(/\/+$/, '') : '';
  if (raw) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      return new URL(withScheme).origin;
    } catch {
      // fall through to request origin
    }
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
};

const isAbsoluteHttpUrl = (value: string): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const parseOptionGroupOptions = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  } catch {
    return [];
  }
};

const normalizeOptionGroupOptions = (values: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  values.forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });
  return normalized;
};

const buildCategoryOptionGroupLookup = (categories: CategoryRow[]) => {
  const map = new Map<string, { label: string; options: string[] }>();
  categories.forEach((cat) => {
    const label = (cat.option_group_label || '').trim();
    const options = normalizeOptionGroupOptions(parseOptionGroupOptions(cat.option_group_options_json));
    if (!label || options.length === 0) return;
    const slugKey = cat.slug ? normalizeCategoryKey(cat.slug) : '';
    const nameKey = cat.name ? normalizeCategoryKey(cat.name) : '';
    [slugKey, nameKey].filter(Boolean).forEach((key) => {
      if (!map.has(key)) map.set(key, { label, options });
    });
  });
  return map;
};

const resolveOptionValue = (options: string[], rawValue?: string | null): string | null => {
  const trimmed = (rawValue || '').trim();
  if (!trimmed || options.length === 0) return null;
  const match = options.find((opt) => opt.toLowerCase() === trimmed.toLowerCase());
  return match || null;
};

const parseCategorySlugs = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => typeof v === 'string')
      .map((v) => normalizeCategoryKey(v))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const withinWindow = (nowMs: number, startsAt?: string | null, endsAt?: string | null): boolean => {
  if (startsAt) {
    const startMs = Date.parse(startsAt);
    if (!Number.isFinite(startMs) || nowMs < startMs) return false;
  }
  if (endsAt) {
    const endMs = Date.parse(endsAt);
    if (!Number.isFinite(endMs) || nowMs > endMs) return false;
  }
  return true;
};

export const onRequestPost = async (context: {
  request: Request;
  env: { DB: D1Database; STRIPE_SECRET_KEY?: string; VITE_PUBLIC_SITE_URL?: string; SHIPPING_DEBUG?: string };
}) => {
  const { request, env } = context;
  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  const shippingDebug = env.SHIPPING_DEBUG === '1';
  const invalidImageSamples: string[] = [];

  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return json({ error: 'Stripe is not configured' }, 500);
  }
  console.log('Stripe secret present?', !!stripeSecretKey);

  try {
    const body = (await request.json()) as {
      items?: Array<{
        productId?: string;
        quantity?: number;
        stripePriceId?: string;
        priceCents?: number;
        price?: number;
        optionGroupLabel?: string | null;
        optionValue?: string | null;
      }>;
      promoCode?: string;
    };
    const itemsPayload = Array.isArray(body.items) ? body.items : [];
    const clientPriceItems = itemsPayload.filter(
      (item) => item?.stripePriceId || item?.priceCents !== undefined || item?.price !== undefined
    );
    if (clientPriceItems.length) {
      console.warn('[checkout] ignoring client price fields', { count: clientPriceItems.length });
    }
    const clientPriceByProduct = new Map<string, string>();
    itemsPayload.forEach((item) => {
      if (!item?.productId || typeof item.stripePriceId !== 'string') return;
      const key = item.productId.trim();
      if (!key) return;
      clientPriceByProduct.set(key, item.stripePriceId);
    });
    if (!itemsPayload.length) {
      return json({ error: 'At least one item is required' }, 400);
    }

    const normalizedItems = itemsPayload
      .map((i) => ({
        productId: i.productId?.trim(),
        quantity: Math.max(1, Number(i.quantity || 1)),
        optionGroupLabel: typeof i.optionGroupLabel === 'string' ? i.optionGroupLabel.trim() : null,
        optionValue: typeof i.optionValue === 'string' ? i.optionValue.trim() : null,
      }))
      .filter((i) => i.productId);

    if (!normalizedItems.length) {
      return json({ error: 'Invalid items' }, 400);
    }

    const groupedByKey = new Map<
      string,
      { productId: string; quantity: number; optionGroupLabel?: string | null; optionValue?: string | null }
    >();
    normalizedItems.forEach((item) => {
      if (!item.productId) return;
      const key = `${item.productId}::${(item.optionValue || '').trim()}`;
      const existing = groupedByKey.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        groupedByKey.set(key, { ...item, quantity: item.quantity });
      }
    });

    const groupedItems = Array.from(groupedByKey.values());
    const productIds = Array.from(new Set(groupedItems.map((item) => item.productId)));
    if (!productIds.length) {
      return json({ error: 'No products to checkout' }, 400);
    }

    const placeholders = productIds.map(() => '?').join(',');
    const productsRes = await env.DB.prepare(
      `
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json, is_active,
             is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id, collection, created_at
      FROM products
      WHERE id IN (${placeholders}) OR stripe_product_id IN (${placeholders});
    `
    )
      .bind(...productIds, ...productIds)
      .all<ProductRow>();

    const products = productsRes.results || [];
    console.log('create-session products fetched', { requested: productIds.length, found: products.length });
    const productMap = new Map<string, ProductRow>();
    for (const p of products) {
      if (p.id) productMap.set(p.id, p);
      if (p.stripe_product_id) productMap.set(p.stripe_product_id, p);
    }

    const nowMs = Date.now();
    const promoCodeRaw = typeof body.promoCode === 'string' ? body.promoCode : '';
    const promoCodeNormalized = promoCodeRaw.trim().toLowerCase();

    const promotionRow = await env.DB.prepare(
      `
      SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
             starts_at, ends_at, enabled, updated_at
      FROM promotions
      WHERE enabled = 1
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at >= ?)
      ORDER BY updated_at DESC
      LIMIT 1;
    `
    )
      .bind(new Date(nowMs).toISOString(), new Date(nowMs).toISOString())
      .first<PromotionRow>();

    const autoPromo = promotionRow && promotionRow.enabled === 1 && withinWindow(nowMs, promotionRow.starts_at, promotionRow.ends_at)
      ? {
          id: promotionRow.id,
          percentOff: Math.max(0, Number(promotionRow.percent_off || 0)),
          scope: promotionRow.scope === 'categories' ? 'categories' : 'global',
          categorySlugs: parseCategorySlugs(promotionRow.category_slugs_json),
          bannerEnabled: promotionRow.banner_enabled === 1,
          bannerText: promotionRow.banner_text || '',
          startsAt: promotionRow.starts_at || null,
          endsAt: promotionRow.ends_at || null,
        }
      : null;

    let promoCodeRow: PromoCodeRow | null = null;
    if (promoCodeNormalized) {
      promoCodeRow = await env.DB
        .prepare(
          `
          SELECT id, code, enabled, percent_off, free_shipping, scope, category_slugs_json, starts_at, ends_at
          FROM promo_codes
          WHERE lower(code) = ?
          LIMIT 1;
        `
        )
        .bind(promoCodeNormalized)
        .first<PromoCodeRow>();
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let subtotalCents = 0;
    const itemsForShipping: Array<{ category?: string | null }> = [];
    const cartCategoryKeys: string[] = [];

    for (const pid of productIds) {
      const product = productMap.get(pid);
      if (product?.category) {
        const key = normalizeCategoryKey(product.category);
        if (key) cartCategoryKeys.push(key);
      }
    }

    let codePromo: {
      code: string;
      percentOff: number | null;
      freeShipping: boolean;
      scope: 'global' | 'categories';
      categorySlugs: string[];
    } | null = null;

    if (promoCodeNormalized) {
      const row = promoCodeRow;
      const isEnabled = row?.enabled === 1;
      const isWithinWindow = row ? withinWindow(nowMs, row.starts_at, row.ends_at) : false;
      const percentOff = row?.percent_off;
      const percentValid = percentOff !== null && Number.isFinite(percentOff) && percentOff >= 1 && percentOff <= 90;
      const freeShipping = row?.free_shipping === 1;
      const scope = row?.scope === 'categories' ? 'categories' : row?.scope === 'global' ? 'global' : null;
      const categorySlugs = parseCategorySlugs(row?.category_slugs_json || null);

      const baseValid = !!row && isEnabled && isWithinWindow && (percentValid || freeShipping) && scope !== null;
      if (!baseValid) {
        return json({ error: 'Promo code is invalid or expired' }, 400);
      }

      if (scope === 'categories') {
        if (!categorySlugs.length) {
          return json({ error: 'Promo code is not eligible for these items' }, 400);
        }
        const hasMatch = cartCategoryKeys.some((key) => categorySlugs.includes(key));
        if (!hasMatch) {
          return json({ error: 'Promo code is not eligible for these items' }, 400);
        }
      }

      codePromo = {
        code: row?.code || promoCodeNormalized,
        percentOff: percentValid ? Number(percentOff) : null,
        freeShipping,
        scope,
        categorySlugs,
      };
    }

    let maxPercentApplied = 0;
    let autoPercentApplied = false;
    const codeUsed = !!codePromo;
    const freeShippingApplied = !!codePromo?.freeShipping;

    const optionCategories = await loadCategoryOptionGroups(env.DB, shippingDebug);
    const optionGroupLookup = buildCategoryOptionGroupLookup(optionCategories);

    for (const item of groupedItems) {
      const pid = item.productId;
      const product = productMap.get(pid);
      if (!product) {
        return json({ error: `Product not found: ${pid}` }, 404);
      }
      const clientStripePrice = clientPriceByProduct.get(pid);
      if (clientStripePrice && product.stripe_price_id && clientStripePrice !== product.stripe_price_id) {
        console.warn('[checkout] client price mismatch; using DB price', {
          productId: pid,
          clientStripePrice,
          dbStripePrice: product.stripe_price_id,
        });
      }
      if (product.is_active === 0) {
        return json({ error: `Product inactive: ${product.name || pid}` }, 400);
      }
      if (product.is_sold === 1) {
        return json({ error: `Product already sold: ${product.name || pid}` }, 400);
      }
      if (product.price_cents === null || product.price_cents === undefined) {
        return json({ error: `Product missing price: ${product.name || pid}` }, 400);
      }
      if (!product.stripe_price_id) {
        return json({ error: `Product missing Stripe price: ${product.name || pid}` }, 400);
      }
      const requestedQuantity = item.quantity || 1;
      const quantity =
        product.is_one_off === 1
          ? 1
          : Math.min(requestedQuantity, product.quantity_available ?? requestedQuantity);

      if (product.quantity_available !== null && product.quantity_available !== undefined && quantity > product.quantity_available) {
        return json({ error: `Requested quantity exceeds available inventory for ${product.name || pid}` }, 400);
      }

      const categoryKey = product.category ? normalizeCategoryKey(product.category) : '';
      const optionGroup = categoryKey ? optionGroupLookup.get(categoryKey) : null;
      const resolvedOptionValue = optionGroup
        ? resolveOptionValue(optionGroup.options, item.optionValue)
        : null;

      if (optionGroup && !resolvedOptionValue) {
        return json({ error: `Selection required for ${product.name || pid}` }, 400);
      }
      const autoEligible =
        !!autoPromo &&
        (autoPromo.scope === 'global' ||
          (autoPromo.scope === 'categories' && categoryKey && autoPromo.categorySlugs.includes(categoryKey)));
      const codePercentEligible =
        !!codePromo?.percentOff &&
        (codePromo.scope === 'global' ||
          (codePromo.scope === 'categories' && categoryKey && codePromo.categorySlugs.includes(categoryKey)));

      const autoPercent = autoEligible ? autoPromo?.percentOff || 0 : 0;
      const codePercent = codePercentEligible ? codePromo?.percentOff || 0 : 0;
      const appliedPercent = Math.max(autoPercent, codePercent);

      const discountedCents = Math.max(
        0,
        Math.round(((product.price_cents ?? 0) * (100 - appliedPercent)) / 100)
      );
      const unitAmount = appliedPercent > 0 ? discountedCents : product.price_cents ?? 0;
      const metadata: Stripe.MetadataParam = {
        dd_product_id: product.stripe_product_id || product.id,
      };
      if (optionGroup && resolvedOptionValue) {
        metadata.option_group_label = optionGroup.label;
        metadata.option_value = resolvedOptionValue;
      }

      const imageUrls = resolveProductImages(product);
      const stripeImages = imageUrls.filter((url) => {
        if (isAbsoluteHttpUrl(url)) return true;
        if (invalidImageSamples.length < 2) invalidImageSamples.push(url);
        return false;
      });
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: product.name || 'Item',
            images: stripeImages.length ? stripeImages.slice(0, 4) : undefined,
            metadata,
          },
        },
        quantity,
      });
      if (autoPercent === appliedPercent && autoPercent > 0) autoPercentApplied = true;
      maxPercentApplied = Math.max(maxPercentApplied, appliedPercent);
      subtotalCents += (product.price_cents ?? 0) * quantity;
      itemsForShipping.push({ category: product.category ?? null });
    }

    const checkoutOrigin = resolveCheckoutOrigin(env.VITE_PUBLIC_SITE_URL, request);
    if (!checkoutOrigin) {
      console.error('Missing VITE_PUBLIC_SITE_URL in env');
      return json({ error: 'Server configuration error: missing site URL' }, 500);
    }

    const categories = await loadCategoryShipping(env.DB, shippingDebug);
    const shippingCents = calculateShippingCents(itemsForShipping, categories);
    const shippingCentsEffective = freeShippingApplied ? 0 : shippingCents;
    const expiresAt = Math.floor(Date.now() / 1000) + 1800; // Stripe requires at least 30 minutes
    console.log('Creating embedded checkout session with expires_at', expiresAt);

    if (shippingDebug) {
      console.log('[shipping] create-session', {
        shippingCents,
        shippingCentsEffective,
        categories: categories.length,
        items: itemsForShipping.length,
      });
    }

    try {
      // Stripe Dashboard Prereqs (Tax):
      // [ ] Enable Stripe Tax
      // [ ] Add tax registrations for required jurisdictions
      // [ ] Set default product tax code (txcd_99999999 for tangible goods)
      // [ ] Configure shipping tax treatment / shipping tax code
      const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: 'Shipping',
            fixed_amount: {
              amount: shippingCentsEffective,
              currency: 'usd',
            },
          },
        },
      ];
      const promoSource =
        maxPercentApplied === 0 && !freeShippingApplied
          ? ''
          : autoPercentApplied && codeUsed
          ? 'auto+code'
          : autoPercentApplied
          ? 'auto'
          : codeUsed
          ? 'code'
          : '';
      const autoPromoIdForMeta = autoPercentApplied && autoPromo?.id ? autoPromo.id : '';
      const session = await createCheckoutSession(stripeSecretKey, {
        mode: 'payment',
        ui_mode: 'embedded',
        line_items: lineItems,
        return_url: `${checkoutOrigin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        metadata: {
          shipping_cents: String(shippingCentsEffective),
          mv_promo_code: codePromo?.code || '',
          mv_free_shipping_applied: freeShippingApplied ? '1' : '0',
          mv_percent_off_applied: String(maxPercentApplied || 0),
          mv_promo_source: promoSource,
          mv_auto_promo_id: autoPromoIdForMeta,
        },
        consent_collection: {
          promotions: 'auto',
        },
        automatic_tax: {
          enabled: true,
        },
        shipping_address_collection: {
          allowed_countries: ['US', 'CA'],
        },
        shipping_options: shippingOptions,
        billing_address_collection: 'auto',
        expires_at: expiresAt,
      });

      if (!session.client_secret) {
        console.error('Stripe did not return a client_secret', session.id);
        return json({ error: 'Unable to create checkout session' }, 500);
      }

      return json({
        clientSecret: session.client_secret,
        sessionId: session.id,
        promo: {
          code: codePromo?.code || null,
          percentOff: maxPercentApplied || 0,
          freeShippingApplied,
          source: promoSource || null,
          codePercentOff: codePromo?.percentOff ?? null,
          codeScope: codePromo?.scope ?? null,
          codeCategorySlugs: codePromo?.categorySlugs ?? [],
          autoPromoId: autoPromoIdForMeta || null,
        },
      });
    } catch (stripeError: any) {
      console.error('Stripe checkout session error:', {
        message: stripeError?.message || stripeError,
        raw: stripeError?.raw,
        origin: checkoutOrigin,
        envUrl: env.VITE_PUBLIC_SITE_URL,
        invalidImages: invalidImageSamples.slice(0, 2),
      });
      const message =
        stripeError?.raw?.message ||
        stripeError?.message ||
        'Failed to create checkout session';
      return json({ error: message }, 500);
    }
  } catch (error) {
    console.error('Error creating embedded checkout session', error);
    return json({ error: 'Failed to create checkout session' }, 500);
  }
};

const safeParseJsonArray = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string');
  } catch {
    return [];
  }
};

const resolveProductImages = (product: ProductRow): string[] => {
  const extras = safeParseJsonArray(product.image_urls_json);
  const primary = product.image_url || extras[0] || '';
  const combined = [primary, ...extras.filter((url) => url !== primary)].filter(Boolean);
  return combined.slice(0, 8);
};

async function loadCategoryOptionGroups(db: D1Database, debug: boolean): Promise<CategoryRow[]> {
  try {
    await ensureCategoryOptionColumns(db);
    const { results } = await db
      .prepare(`SELECT id, name, slug, option_group_label, option_group_options_json FROM categories`)
      .all<CategoryRow>();
    return results || [];
  } catch (error) {
    if (debug) {
      console.error('[checkout] failed to load category option groups', error);
    }
    return [];
  }
}

async function ensureCategoryOptionColumns(db: D1Database) {
  const columns = [
    'option_group_label TEXT',
    'option_group_options_json TEXT',
  ];
  for (const ddl of columns) {
    try {
      await db.prepare(`ALTER TABLE categories ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        throw error;
      }
    }
  }
}

async function loadCategoryShipping(db: D1Database, debug: boolean): Promise<CategoryRow[]> {
  try {
    await ensureCategoryShippingColumn(db);
    const { results } = await db
      .prepare(`SELECT id, name, slug, shipping_cents FROM categories`)
      .all<CategoryRow>();
    return results || [];
  } catch (error) {
    if (debug) {
      console.error('[shipping] failed to load category shipping', error);
    }
    return [];
  }
}

async function ensureCategoryShippingColumn(db: D1Database) {
  try {
    await db.prepare(`ALTER TABLE categories ADD COLUMN shipping_cents INTEGER DEFAULT 0;`).run();
  } catch (error) {
    const message = (error as Error)?.message || '';
    if (!/duplicate column|already exists/i.test(message)) {
      throw error;
    }
  }
}
