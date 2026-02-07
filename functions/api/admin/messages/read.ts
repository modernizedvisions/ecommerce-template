import { requireAdmin } from '../../_lib/adminAuth';
import { ensureMessagesSchema } from '../../_lib/messagesSchema';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export async function onRequestPost(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;

    await ensureMessagesSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const result = await context.env.DB.prepare(
      `UPDATE messages SET is_read = 1, read_at = datetime('now') WHERE id = ?`
    )
      .bind(id)
      .run();

    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Failed to mark message as read' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const unreadRow = await context.env.DB.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE is_read IS NULL OR is_read = 0`
    ).first<{ count: number }>();
    const unreadCount = unreadRow?.count ?? 0;

    return new Response(JSON.stringify({ success: true, unreadCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('[/api/admin/messages/read] error', err);
    return new Response(JSON.stringify({ error: 'Failed to update message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

