import { ensureImagesSchema } from '../../lib/images';
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
  ADMIN_PASSWORD?: string;
  DB?: D1Database;
};

type ImageRow = {
  id: string;
  storage_key: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestDelete(context: {
  env: Env;
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const id = params?.id;

  console.log('[images/delete] request', { id, method: request.method, url: request.url });

  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  if (!env.DB) {
    return json({ ok: false, code: 'MISSING_D1', message: 'Missing DB binding' }, 500);
  }

  if (!env.IMAGES_BUCKET) {
    return json({ ok: false, code: 'MISSING_R2', message: 'Missing IMAGES_BUCKET binding' }, 500);
  }

  if (!id) {
    return json({ ok: false, code: 'MISSING_ID', message: 'Image id is required' }, 400);
  }

  try {
    await ensureImagesSchema(env.DB);
    const row = await env.DB
      .prepare(`SELECT id, storage_key FROM images WHERE id = ?;`)
      .bind(id)
      .first<ImageRow>();

    if (!row?.id) {
      return json({ ok: false, code: 'NOT_FOUND', message: 'Image not found' }, 404);
    }

    if (!row.storage_key) {
      return json({ ok: false, code: 'MISSING_STORAGE_KEY', message: 'Image storage key missing' }, 500);
    }

    try {
      await env.IMAGES_BUCKET.delete(row.storage_key);
    } catch (error) {
      console.error('[images/delete] R2 delete failed', error);
      return json({ ok: false, code: 'R2_DELETE_FAILED', message: 'Failed to delete image from storage' }, 500);
    }

    const result = await env.DB.prepare(`DELETE FROM images WHERE id = ?;`).bind(id).run();
    if (!result.success) {
      return json({ ok: false, code: 'D1_DELETE_FAILED', message: 'Failed to delete image metadata' }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('[images/delete] failed', error);
    return json({ ok: false, code: 'DELETE_FAILED', message: 'Image delete failed' }, 500);
  }
}

export async function onRequest(context: {
  env: Env;
  params: Record<string, string>;
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;
  if (context.request.method.toUpperCase() === 'DELETE') {
    return onRequestDelete(context);
  }
  return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, 405);
}

