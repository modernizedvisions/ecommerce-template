import { requireAdmin } from '../../../_lib/adminAuth';

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
  display_custom_order_id?: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_email1?: string | null;
  description: string | null;
  image_url?: string | null;
  amount: number | null;
  shipping_cents?: number | null;
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
  archived?: number | null;
  archived_at?: string | null;
  created_at: string | null;
};

export async function onRequestPatch(context: {
  env: { DB: D1Database };
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureCustomOrdersSchema(context.env.DB);
    const columns = await getCustomOrdersColumns(context.env.DB);
    const emailCol = columns.emailCol;
    const id = context.params?.id;
    if (!id) return jsonResponse({ error: 'Missing id' }, 400);

    const existing = await context.env.DB
      .prepare(
        `SELECT id, display_custom_order_id, customer_name, ${
          emailCol ? `${emailCol} AS customer_email` : 'NULL AS customer_email'
        }, description, image_url, amount, shipping_cents, message_id, status, payment_link,
          shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone,
          paid_at, archived, archived_at, created_at
         FROM custom_orders WHERE id = ?`
      )
      .bind(id)
      .first<CustomOrderRow>();

    if (!existing) return jsonResponse({ error: 'Not found' }, 404);

    const archivedAt = new Date().toISOString();
    const update = await context.env.DB
      .prepare(`UPDATE custom_orders SET archived = 1, archived_at = ? WHERE id = ?`)
      .bind(archivedAt, id)
      .run();

    if (!update.success) {
      console.error('Failed to archive custom order', update.error);
      return jsonResponse({ error: 'Failed to archive custom order', detail: update.error || 'unknown error' }, 500);
    }

    const updated: CustomOrderRow = {
      ...existing,
      archived: 1,
      archived_at: archivedAt,
    };

    return jsonResponse({ success: true, order: mapRow(updated) });
  } catch (err) {
    console.error('Failed to archive custom order', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to archive custom order', detail: message }, 500);
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
    amount INTEGER,
    shipping_cents INTEGER NOT NULL DEFAULT 0,
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
  if (!names.includes('shipping_cents')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN shipping_cents INTEGER NOT NULL DEFAULT 0;`).run();
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
      await db.prepare(`ALTER TABLE custom_orders ADD COLUMN ${col} TEXT;`).run();
    }
  }

  await db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_orders_display_id ON custom_orders(display_custom_order_id);`
  ).run();
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
    amount: row.amount ?? null,
    shippingCents: row.shipping_cents ?? 0,
    messageId: row.message_id ?? null,
    status: (row.status as 'pending' | 'paid') ?? 'pending',
    paymentLink: row.payment_link ?? null,
    createdAt: row.created_at ?? null,
    paidAt: row.paid_at ?? null,
    archived: row.archived === 1,
    archivedAt: row.archived_at ?? null,
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

