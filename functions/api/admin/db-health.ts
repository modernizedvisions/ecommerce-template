import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export const onRequestGet = async (context: { request: Request; env: { DB: D1Database } }) => {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;
  const { DB } = context.env;
  try {
    const { results: tableRows } = await DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
    ).all<{ name: string }>();
    const tables = (tableRows || []).map((r) => r.name);

    const countFor = async (table: string): Promise<number | null> => {
      try {
        const row = await DB.prepare(`SELECT COUNT(*) as c FROM ${table};`).first<{ c: number }>();
        return row?.c ?? 0;
      } catch {
        return null;
      }
    };

    const counts = {
      orders: await countFor('orders'),
      products: await countFor('products'),
      messages: await countFor('messages'),
      custom_orders: await countFor('custom_orders'),
    };

    return new Response(
      JSON.stringify({
        ok: true,
        tables,
        counts,
        envHint: {
          host: context.request.headers.get('host'),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[db-health] failed', err);
    return new Response(JSON.stringify({ ok: false, error: 'db-health failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

