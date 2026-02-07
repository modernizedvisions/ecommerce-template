import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

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

export async function onRequestPost(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;

    await ensureOrdersSeenSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const result = await context.env.DB.prepare(
      `UPDATE orders SET is_seen = 1, seen_at = datetime('now') WHERE id = ?`
    )
      .bind(id)
      .run();

    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Failed to mark order as seen' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const unseenRow = await context.env.DB.prepare(
      `SELECT COUNT(*) as count FROM orders WHERE is_seen IS NULL OR is_seen = 0`
    ).first<{ count: number }>();
    const unseenCount = unseenRow?.count ?? 0;

    return new Response(JSON.stringify({ success: true, unseenCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('[/api/admin/orders/seen] error', err);
    return new Response(JSON.stringify({ error: 'Failed to update order' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

