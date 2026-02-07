type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

import { extractStorageKey } from '../lib/images';
import { requireAdmin } from '../_lib/adminAuth';

type CustomOrderRow = {
  id: string;
  display_custom_order_id?: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_email1?: string | null;
  description: string | null;
  image_url?: string | null;
  image_id?: string | null;
  image_storage_key?: string | null;
  amount: number | null;
  shipping_cents?: number | null;
  show_on_sold_products?: number | null;
  message_id: string | null;
  status: string | null;
  payment_link: string | null;
  shipping_name?: string | null;
  shipping_line1?: string | null;
  shipping_line2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
  shipping_phone?: string | null;
  paid_at?: string | null;
  created_at: string | null;
};

type CustomOrderPayload = {
  customerName: string;
  customerEmail: string;
  description: string;
  imageUrl?: string | null;
  imageId?: string | null;
  imageStorageKey?: string | null;
  amount?: number;
  shippingCents?: number;
  showOnSoldProducts?: boolean;
  messageId?: string | null;
  status?: 'pending' | 'paid';
  paymentLink?: string | null;
};

export async function onRequestGet(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureCustomOrdersSchema(context.env.DB);
    const columns = await getCustomOrdersColumns(context.env.DB);
    const emailCol = columns.emailCol;
    console.log('[custom-orders] ensured schema', { columns: columns.allColumns, emailCol });

    const statement = context.env.DB.prepare(
      `SELECT id, display_custom_order_id, customer_name, ${
        emailCol ? `${emailCol} AS customer_email` : 'NULL AS customer_email'
      }, description, image_url, image_id, image_storage_key, amount, shipping_cents, show_on_sold_products, message_id, status, payment_link,
        shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone,
        paid_at, created_at
       FROM custom_orders
       WHERE archived = 0
       ORDER BY datetime(created_at) DESC`
    );
    const { results } = await statement.all<CustomOrderRow>();
    const orders = (results || []).map(mapRow);
    console.log('[custom-orders] fetched orders', { count: orders.length });
    return jsonResponse({ orders });
  } catch (err) {
    console.error('Failed to fetch custom orders', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to fetch custom orders', detail: message }, 500);
  }
}

export async function onRequestPost(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureCustomOrdersSchema(context.env.DB);
    const columns = await getCustomOrdersColumns(context.env.DB);
    const emailCol = columns.emailCol;
    const debug = (context as any)?.env?.DEBUG_CUSTOM_ORDERS === '1';
    console.log('[custom-orders] ensured schema (post)', { columns: columns.allColumns, emailCol });
    const body = (await context.request.json().catch(() => null)) as Partial<CustomOrderPayload> | null;
    if (!body || !body.customerName || !body.customerEmail || !body.description) {
      return jsonResponse({ error: 'customerName, customerEmail, and description are required.' }, 400);
    }
    if (isBlockedImageUrl(body.imageUrl)) {
      return jsonResponse({ error: 'imageUrl must be uploaded first (no blob/data URLs).' }, 400);
    }
    const shippingCents = normalizeShippingCents(body.shippingCents);
    if (shippingCents === null) {
      return jsonResponse({ error: 'shippingCents must be a non-negative integer.' }, 400);
    }
    const normalizedImageUrl = body.imageUrl ? body.imageUrl.trim() : null;
    const resolvedStorageKey =
      body.imageStorageKey?.trim() || extractStorageKey(normalizedImageUrl);
    const resolvedImageId = body.imageId ? body.imageId.trim() : null;
    const hasImage = !!(normalizedImageUrl || resolvedStorageKey || resolvedImageId);
    const showOnSoldProducts = hasImage && body.showOnSoldProducts === true ? 1 : 0;
    if (debug) {
      console.log('[custom-orders] create payload', {
        shippingRaw: body.shippingCents,
        shippingCents,
      showOnSoldProducts,
        amount: body.amount,
      });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const status = body.status === 'paid' ? 'paid' : 'pending';
    const displayId = await generateDisplayCustomOrderId(context.env.DB);

    const insertColumns = [
      'id',
      'display_custom_order_id',
      'customer_name',
      emailCol ?? undefined,
      'description',
      'image_url',
      'image_id',
      'image_storage_key',
      'amount',
      'shipping_cents',
      'show_on_sold_products',
      'message_id',
      'status',
      'payment_link',
      'shipping_name',
      'shipping_line1',
      'shipping_line2',
      'shipping_city',
      'shipping_state',
      'shipping_postal_code',
      'shipping_country',
      'shipping_phone',
      'created_at',
    ].filter(Boolean) as string[];
    const placeholders = insertColumns.map(() => '?').join(', ');
    const values: unknown[] = [
      id,
      displayId,
      body.customerName.trim(),
    ];
    if (emailCol) {
      values.push(body.customerEmail.trim());
    }
    values.push(
      body.description.trim(),
      normalizedImageUrl,
      resolvedImageId,
      resolvedStorageKey,
      body.amount ?? null,
      shippingCents,
      showOnSoldProducts,
      body.messageId ?? null,
      status,
      body.paymentLink ?? null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      createdAt
    );

    console.log('[custom-orders] inserting', { insertColumns, displayId });
    if (debug) {
      console.log('[custom-orders] insert values', {
        id,
        displayId,
        amount: body.amount,
        shippingCents,
      showOnSoldProducts,
      });
    }
    const stmt = context.env.DB.prepare(
      `INSERT INTO custom_orders (${insertColumns.join(', ')}) VALUES (${placeholders})`
    ).bind(...values);

    const result = await stmt.run();
    if (!result.success) {
      console.error('Failed to insert custom order', result.error);
      return jsonResponse({ error: 'Failed to create custom order', detail: result.error || 'unknown error' }, 500);
    }

    const createdRow: CustomOrderRow = {
      id,
      display_custom_order_id: displayId,
      customer_name: body.customerName.trim(),
      customer_email: emailCol ? body.customerEmail.trim() : null,
      description: body.description.trim(),
      image_url: normalizedImageUrl,
      image_id: resolvedImageId,
      image_storage_key: resolvedStorageKey,
      amount: body.amount ?? null,
      shipping_cents: shippingCents,
      show_on_sold_products: showOnSoldProducts,
      message_id: body.messageId ?? null,
      status,
      payment_link: body.paymentLink ?? null,
      created_at: createdAt,
    };

    // Return the created order so the UI can append without a full refetch.
    return jsonResponse({
      success: true,
      order: mapRow(createdRow),
    });
  } catch (err) {
    console.error('Failed to create custom order', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to create custom order', detail: message }, 500);
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
    paid_at TEXT,
    shipping_name TEXT,
    shipping_line1 TEXT,
    shipping_line2 TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_postal_code TEXT,
    shipping_country TEXT,
    shipping_phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_order_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((col) => col.name);
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
  const shippingColumns = [
    'shipping_name',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_state',
    'shipping_postal_code',
    'shipping_country',
    'shipping_phone',
  ];
  for (const col of shippingColumns) {
    if (!names.includes(col)) {
      await db.prepare(`ALTER TABLE custom_orders ADD COLUMN ${col} TEXT;`).run();
    }
  }
  if (!names.includes('paid_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN paid_at TEXT;`).run();
  }

  await db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_orders_display_id ON custom_orders(display_custom_order_id);`
  ).run();

  await backfillDisplayCustomOrderIds(db);
}

function mapRow(row: CustomOrderRow) {
  const shippingAddress =
    row.shipping_line1 ||
    row.shipping_line2 ||
    row.shipping_city ||
    row.shipping_state ||
    row.shipping_postal_code ||
    row.shipping_country ||
    row.shipping_phone
      ? {
          line1: row.shipping_line1 || null,
          line2: row.shipping_line2 || null,
          city: row.shipping_city || null,
          state: row.shipping_state || null,
          postal_code: row.shipping_postal_code || null,
          country: row.shipping_country || null,
          phone: row.shipping_phone || null,
          name: row.shipping_name || null,
        }
      : null;

  return {
    id: row.id,
    displayCustomOrderId: row.display_custom_order_id ?? '',
    customerName: row.customer_name ?? '',
    customerEmail: row.customer_email ?? row.customer_email1 ?? '',
    description: row.description ?? '',
    imageUrl: row.image_url ?? null,
    imageId: row.image_id ?? null,
    imageStorageKey: row.image_storage_key ?? null,
    amount: row.amount ?? null,
    shippingCents: row.shipping_cents ?? 0,
    showOnSoldProducts: row.show_on_sold_products === 1,
    messageId: row.message_id ?? null,
    status: (row.status as 'pending' | 'paid') ?? 'pending',
    paymentLink: row.payment_link ?? null,
    createdAt: row.created_at ?? null,
    paidAt: row.paid_at ?? null,
    shippingAddress,
    shippingName: row.shipping_name ?? null,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}

function isBlockedImageUrl(value?: string | null) {
  if (!value) return false;
  return value.startsWith('data:') || value.startsWith('blob:');
}

function normalizeShippingCents(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

async function generateDisplayCustomOrderId(db: D1Database): Promise<string> {
  const yearFull = new Date().getFullYear();
  const yy = yearFull % 100;
  try {
    const counterRow = await db
      .prepare(
        `INSERT INTO custom_order_counters (year, counter)
         VALUES (?, 1)
         ON CONFLICT(year) DO UPDATE SET counter = counter + 1
         RETURNING counter;`
      )
      .bind(yearFull)
      .first<{ counter: number }>();

    if (!counterRow || typeof counterRow.counter !== 'number') {
      throw new Error('Missing counter value');
    }

    const padded = String(counterRow.counter).padStart(3, '0');
    return `CO-${yy}-${padded}`;
  } catch (error) {
    console.error('Failed to generate display custom order id', error);
    throw error;
  }
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

async function backfillDisplayCustomOrderIds(db: D1Database) {
  const missing = await db
    .prepare(
      `SELECT id, created_at FROM custom_orders WHERE display_custom_order_id IS NULL OR display_custom_order_id = '' ORDER BY datetime(created_at) ASC`
    )
    .all<{ id: string; created_at: string }>();

  const rows = missing.results || [];
  if (!rows.length) return;

  const countersByYear = new Map<number, number>();
  const existingCounters = await db.prepare(`SELECT year, counter FROM custom_order_counters`).all<{ year: number; counter: number }>();
  (existingCounters.results || []).forEach((row) => countersByYear.set(row.year, row.counter));

  try {
    for (const row of rows) {
      const displayId = await generateDisplayCustomOrderId(db);
      await db
        .prepare(`UPDATE custom_orders SET display_custom_order_id = ? WHERE id = ?`)
        .bind(displayId, row.id)
        .run();
    }

  } catch (error) {
    console.error('Failed to backfill display custom order ids', error);
    throw error;
  }
}




