import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type OrderRow = {
  id: string;
  display_order_id?: string | null;
  stripe_payment_intent_id: string | null;
  total_cents: number | null;
  amount_total_cents?: number | null;
  amount_subtotal_cents?: number | null;
  amount_shipping_cents?: number | null;
  amount_tax_cents?: number | null;
  amount_discount_cents?: number | null;
  currency?: string | null;
  shipping_cents?: number | null;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_address_json: string | null;
  card_last4?: string | null;
  card_brand?: string | null;
  promo_code?: string | null;
  promo_percent_off?: number | null;
  promo_free_shipping?: number | null;
  promo_source?: string | null;
  is_seen?: number | null;
  seen_at?: string | null;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price_cents: number;
  product_name: string | null;
  product_image_url?: string | null;
  item_image_url?: string | null;
  custom_order_image_url?: string | null;
  custom_order_display_id?: string | null;
  option_group_label?: string | null;
  option_value?: string | null;
};

export const onRequestGet = async (context: { env: { DB: D1Database }; request: Request }): Promise<Response> => {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await assertOrdersTables(context.env.DB);
    await ensureOrdersSeenSchema(context.env.DB);
    const columns = await context.env.DB.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
    const columnNames = (columns.results || []).map((c) => c.name);
    const emailColumn = columnNames.includes('customer_email')
      ? 'customer_email'
      : columnNames.includes('customer_email1')
      ? 'customer_email1'
      : null;
    const displayIdColumn = columnNames.includes('display_order_id') ? 'display_order_id' : null;
    const cardLast4Column = columnNames.includes('card_last4') ? 'card_last4' : null;
    const cardBrandColumn = columnNames.includes('card_brand') ? 'card_brand' : null;
    const promoCodeColumn = columnNames.includes('promo_code') ? 'promo_code' : null;
    const promoPercentColumn = columnNames.includes('promo_percent_off') ? 'promo_percent_off' : null;
    const promoFreeShippingColumn = columnNames.includes('promo_free_shipping') ? 'promo_free_shipping' : null;
    const promoSourceColumn = columnNames.includes('promo_source') ? 'promo_source' : null;
    const isSeenColumn = columnNames.includes('is_seen') ? 'is_seen' : null;
    const seenAtColumn = columnNames.includes('seen_at') ? 'seen_at' : null;
    const currencyColumn = columnNames.includes('currency') ? 'currency' : null;
    const amountTotalColumn = columnNames.includes('amount_total_cents') ? 'amount_total_cents' : null;
    const amountSubtotalColumn = columnNames.includes('amount_subtotal_cents') ? 'amount_subtotal_cents' : null;
    const amountShippingColumn = columnNames.includes('amount_shipping_cents') ? 'amount_shipping_cents' : null;
    const amountTaxColumn = columnNames.includes('amount_tax_cents') ? 'amount_tax_cents' : null;
    const amountDiscountColumn = columnNames.includes('amount_discount_cents') ? 'amount_discount_cents' : null;
    const shippingCentsColumn = columnNames.includes('shipping_cents') ? 'shipping_cents' : null;

    const selectSql = `
      SELECT
        id,
        ${displayIdColumn ? `${displayIdColumn} AS display_order_id` : 'NULL AS display_order_id'},
        stripe_payment_intent_id,
        total_cents,
        ${amountTotalColumn ? `${amountTotalColumn} AS amount_total_cents` : 'NULL AS amount_total_cents'},
        ${amountSubtotalColumn ? `${amountSubtotalColumn} AS amount_subtotal_cents` : 'NULL AS amount_subtotal_cents'},
        ${amountShippingColumn ? `${amountShippingColumn} AS amount_shipping_cents` : 'NULL AS amount_shipping_cents'},
        ${amountTaxColumn ? `${amountTaxColumn} AS amount_tax_cents` : 'NULL AS amount_tax_cents'},
        ${amountDiscountColumn ? `${amountDiscountColumn} AS amount_discount_cents` : 'NULL AS amount_discount_cents'},
        ${currencyColumn ? `${currencyColumn} AS currency` : 'NULL AS currency'},
        ${emailColumn ? `${emailColumn} AS customer_email` : 'NULL AS customer_email'},
        shipping_name,
        shipping_address_json,
        ${shippingCentsColumn ? `${shippingCentsColumn} AS shipping_cents` : 'NULL AS shipping_cents'},
        ${cardLast4Column ? `${cardLast4Column} AS card_last4` : 'NULL AS card_last4'},
        ${cardBrandColumn ? `${cardBrandColumn} AS card_brand` : 'NULL AS card_brand'},
        ${promoCodeColumn ? `${promoCodeColumn} AS promo_code` : 'NULL AS promo_code'},
        ${promoPercentColumn ? `${promoPercentColumn} AS promo_percent_off` : 'NULL AS promo_percent_off'},
        ${promoFreeShippingColumn ? `${promoFreeShippingColumn} AS promo_free_shipping` : 'NULL AS promo_free_shipping'},
        ${promoSourceColumn ? `${promoSourceColumn} AS promo_source` : 'NULL AS promo_source'},
        ${isSeenColumn ? `${isSeenColumn} AS is_seen` : '0 AS is_seen'},
        ${seenAtColumn ? `${seenAtColumn} AS seen_at` : 'NULL AS seen_at'},
        created_at
      FROM orders
      ORDER BY datetime(created_at) DESC
      LIMIT 50;
    `;

    const res = await context.env.DB.prepare(selectSql).all<OrderRow>();
    const orderRows: OrderRow[] = res.results || [];
    console.log('[admin/orders] detected columns', {
      emailColumn,
      displayIdColumn,
      cardLast4Column,
      cardBrandColumn,
      promoCodeColumn,
      promoPercentColumn,
      promoFreeShippingColumn,
      promoSourceColumn,
      count: orderRows.length,
    });

    const productColumns = await context.env.DB.prepare(`PRAGMA table_info(products);`).all<{ name: string }>();
    const productCols = new Set((productColumns.results || []).map((c) => c.name));
  const joinColumn = productCols.has('stripe_product_id')
    ? 'stripe_product_id'
    : productCols.has('stripe_product_id'.toUpperCase())
    ? 'stripe_product_id'.toUpperCase()
    : 'id';

  const hasImageUrlsJson = productCols.has('image_urls_json');
  const hasShippingCents = columnNames.includes('shipping_cents') || columnNames.includes('amount_shipping_cents');
  const orderIds = (orderRows || []).map((o) => o.id);
  const itemColumns = await context.env.DB.prepare(`PRAGMA table_info(order_items);`).all<{ name: string }>();
  const itemCols = new Set((itemColumns.results || []).map((c) => c.name));
  const hasItemImageUrl = itemCols.has('image_url');
  let itemsByOrder: Record<string, OrderItemRow[]> = {};

    if (orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');
      const imageSelect = hasImageUrlsJson
        ? `COALESCE(p.image_url,
            (SELECT json_extract(p.image_urls_json, '$[0]'))
          )`
        : `p.image_url`;

      const itemImageSelect = hasItemImageUrl ? 'oi.image_url' : 'NULL';
      const productImageSelect = hasItemImageUrl
        ? `COALESCE(oi.image_url, co.image_url, ${imageSelect})`
        : `COALESCE(co.image_url, ${imageSelect})`;

      const joinClause =
        joinColumn === 'id'
          ? `oi.product_id = p.id`
          : `oi.product_id = p.${joinColumn} OR oi.product_id = p.id`;
      const itemsStmt = context.env.DB.prepare(
        `
        SELECT oi.*,
               p.name AS product_name,
               ${itemImageSelect} AS item_image_url,
               co.image_url AS custom_order_image_url,
               co.display_custom_order_id AS custom_order_display_id,
               ${productImageSelect} AS product_image_url
        FROM order_items oi
        LEFT JOIN products p ON ${joinClause}
        LEFT JOIN custom_orders co ON oi.product_id = ('custom_order:' || co.id)
        WHERE oi.order_id IN (${placeholders});
      `
      ).bind(...orderIds);
      const { results: itemRows } = await itemsStmt.all<OrderItemRow>();
      itemsByOrder = (itemRows || []).reduce((acc, item) => {
        acc[item.order_id] = acc[item.order_id] || [];
        acc[item.order_id].push(item);
        return acc;
      }, {} as Record<string, OrderItemRow[]>);
    }
    console.log('[admin/orders] attaching items', { orders: orderRows.length, withItems: Object.keys(itemsByOrder).length });

    const orders = (orderRows || []).map((o) => ({
      id: o.id,
      displayOrderId: o.display_order_id ?? null,
      createdAt: o.created_at,
      totalCents: o.amount_total_cents ?? o.total_cents ?? 0,
      amountTotalCents: o.amount_total_cents ?? null,
      amountSubtotalCents: o.amount_subtotal_cents ?? null,
      amountShippingCents: o.amount_shipping_cents ?? (o as any).shipping_cents ?? null,
      amountTaxCents: o.amount_tax_cents ?? null,
      amountDiscountCents: o.amount_discount_cents ?? null,
      currency: o.currency ?? null,
      shippingCents: hasShippingCents ? (o.amount_shipping_cents ?? (o as any).shipping_cents ?? 0) : 0,
      customerEmail: o.customer_email,
      shippingName: o.shipping_name,
      customerName: o.shipping_name,
      shippingAddress: o.shipping_address_json ? safeParseAddress(o.shipping_address_json) : null,
      cardLast4: o.card_last4 ?? null,
      cardBrand: o.card_brand ?? null,
      promoCode: o.promo_code ?? null,
      promoPercentOff: o.promo_percent_off ?? null,
      promoFreeShipping:
        o.promo_free_shipping === null || o.promo_free_shipping === undefined
          ? null
          : o.promo_free_shipping === 1,
      promoSource: o.promo_source ?? null,
      isSeen: o.is_seen === 1,
      seenAt: o.seen_at ?? null,
      items: (itemsByOrder[o.id] || []).map((i) => ({
        productId: i.product_id,
        productName: i.product_name,
        quantity: i.quantity,
        priceCents: i.price_cents,
        productImageUrl: i.product_image_url ?? null,
        imageUrl: i.item_image_url ?? i.custom_order_image_url ?? null,
        customOrderDisplayId: i.custom_order_display_id ?? null,
        optionGroupLabel: i.option_group_label ?? null,
        optionValue: i.option_value ?? null,
      })),
    }));
    const unseenRow = await context.env.DB.prepare(
      `SELECT COUNT(*) as count FROM orders WHERE is_seen IS NULL OR is_seen = 0`
    ).first<{ count: number }>();
    const unseenCount = unseenRow?.count ?? 0;

    return new Response(JSON.stringify({ orders, unseenCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching admin orders', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Failed to load orders', detail: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function safeParseAddress(jsonString: string | null): Record<string, string | null> | null {
  if (!jsonString) return null;
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string | null>;
    }
    return null;
  } catch {
    return null;
  }
}

async function assertOrdersTables(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders','order_items');`)
    .all<{ name: string }>();
  const existing = new Set((results || []).map((r) => r.name));
  const missing = ['orders', 'order_items'].filter((t) => !existing.has(t));
  if (missing.length) {
    throw new Error(`Missing required tables: ${missing.join(', ')}`);
  }
}

async function ensureOrdersSeenSchema(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const names = new Set((results || []).map((c) => c.name));
  if (!names.has('is_seen')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN is_seen INTEGER NOT NULL DEFAULT 0;`).run();
  }
  if (!names.has('seen_at')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN seen_at TEXT;`).run();
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

