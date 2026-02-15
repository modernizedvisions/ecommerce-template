import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  IMAGES_BUCKET?: R2Bucket;
  DB?: D1Database;
};

type ImageRow = {
  id: string;
  storage_key: string | null;
  public_url: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context: {
  env: Env;
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!context.env.DB) {
    return json({ ok: false, code: 'DB_ERROR', detail: 'Missing DB binding' }, 500);
  }

  const id = context.params?.id;
  if (!id) {
    return json({ ok: false, code: 'MISSING_ID' }, 400);
  }

  const row = await context.env.DB.prepare(`SELECT id, storage_key, public_url FROM images WHERE id = ? LIMIT 1;`).bind(id).first<ImageRow>();
  if (!row?.id) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  return json({
    ok: true,
    image: {
      id: row.id,
      storageKey: row.storage_key,
      publicUrl: row.public_url,
    },
  });
}

export async function onRequestDelete(context: {
  env: Env;
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!context.env.DB) {
    return json({ ok: false, code: 'DB_ERROR', detail: 'Missing DB binding' }, 500);
  }
  if (!context.env.IMAGES_BUCKET) {
    return json({ ok: false, code: 'MISSING_R2' }, 500);
  }

  const id = context.params?.id;
  if (!id) {
    return json({ ok: false, code: 'MISSING_ID' }, 400);
  }

  const row = await context.env.DB.prepare(`SELECT id, storage_key FROM images WHERE id = ? LIMIT 1;`).bind(id).first<ImageRow>();
  if (!row?.id) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  if (row.storage_key) {
    try {
      await context.env.IMAGES_BUCKET.delete(row.storage_key);
    } catch (error) {
      console.error('[admin/images/:id] R2 delete failed', error);
      return json({ ok: false, code: 'R2_DELETE_FAILED' }, 500);
    }
  }

  const result = await context.env.DB.prepare(`DELETE FROM images WHERE id = ?;`).bind(id).run();
  if (!result.success) {
    return json({ ok: false, code: 'DB_ERROR', detail: result.error || 'Delete failed' }, 500);
  }

  return json({ ok: true });
}

export async function onRequest(context: {
  env: Env;
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
}
