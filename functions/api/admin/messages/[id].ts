import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export async function onRequestDelete(context: {
  env: { DB: D1Database };
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;
  const id = context.params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Message id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const result = await context.env.DB.prepare('DELETE FROM messages WHERE id = ?;')
      .bind(id)
      .run();

    if (!result.success) {
      throw new Error(result.error || 'Delete failed');
    }

    if (result.meta?.changes === 0) {
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    return new Response(JSON.stringify({ success: true, deletedId: id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[/api/admin/messages/:id] delete failed', { id, detail });
    return new Response(JSON.stringify({ error: 'Delete message failed', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

