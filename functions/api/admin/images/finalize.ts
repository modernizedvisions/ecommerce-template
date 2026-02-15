import { buildImagesPublicUrl, normalizeImageUrl } from '../../_lib/images';
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
  DB?: D1Database;
  IMAGES_BUCKET?: R2Bucket;
};

type ImageRow = {
  id: string;
  storage_key: string | null;
  public_url: string | null;
  content_type: string | null;
  size_bytes: number | null;
};

type FinalizeBody = {
  imageId?: string;
  entityType?: string;
  entityId?: string;
  kind?: string;
  isPrimary?: boolean;
  sortOrder?: number;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeSortOrder = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!context.env.DB) {
    return json({ ok: false, code: 'DB_ERROR', detail: 'Missing DB binding' }, 500);
  }
  if (!context.env.IMAGES_BUCKET) {
    return json({ ok: false, code: 'MISSING_R2' }, 500);
  }

  let body: FinalizeBody | null = null;
  try {
    body = (await context.request.json()) as FinalizeBody;
  } catch {
    return json({ ok: false, code: 'BAD_INPUT', detail: 'Invalid JSON body' }, 400);
  }

  const imageId = normalizeOptionalString(body?.imageId);
  if (!imageId) {
    return json({ ok: false, code: 'BAD_INPUT', detail: 'imageId is required' }, 400);
  }

  const image = await context.env.DB.prepare(
    `SELECT id, storage_key, public_url, content_type, size_bytes FROM images WHERE id = ? LIMIT 1;`
  )
    .bind(imageId)
    .first<ImageRow>();

  if (!image?.id || !image.storage_key) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  const objectHead = await context.env.IMAGES_BUCKET.head(image.storage_key);
  if (!objectHead) {
    return json({ ok: false, code: 'NOT_FOUND', detail: 'Stored object missing' }, 404);
  }

  const publicUrl = normalizeImageUrl(image.public_url || buildImagesPublicUrl(image.storage_key));
  const updated = await context.env.DB.prepare(
    `UPDATE images
      SET public_url = ?,
          content_type = ?,
          size_bytes = ?,
          entity_type = ?,
          entity_id = ?,
          kind = ?,
          is_primary = ?,
          sort_order = ?
      WHERE id = ?;`
  )
    .bind(
      publicUrl,
      objectHead.httpMetadata?.contentType || image.content_type,
      objectHead.size,
      normalizeOptionalString(body?.entityType),
      normalizeOptionalString(body?.entityId),
      normalizeOptionalString(body?.kind),
      body?.isPrimary ? 1 : 0,
      normalizeSortOrder(body?.sortOrder),
      image.id
    )
    .run();

  if (!updated.success) {
    return json({ ok: false, code: 'DB_ERROR', detail: updated.error || 'Update failed' }, 500);
  }

  return json({
    ok: true,
    image: {
      id: image.id,
      storageKey: image.storage_key,
      publicUrl,
    },
  });
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  return onRequestPost(context);
}
