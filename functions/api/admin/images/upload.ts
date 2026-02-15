import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  buildImageStorageKey,
  buildImagesPublicUrl,
  coerceImageScope,
  normalizeImageUrl,
} from '../../_lib/images';
import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
  IMAGES_BUCKET?: R2Bucket;
  IMAGE_DEBUG?: string;
  IMAGE_STORAGE_PREFIX?: string;
};

type ExistingImage = {
  id: string;
  storage_key: string | null;
};

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const corsHeaders = (request?: Request | null) => {
  const origin = request?.headers.get('Origin') || '';
  return {
    ...(origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        }
      : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Request-Id',
  };
};

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

export async function onRequestOptions(context: { request: Request }): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request),
  });
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  const unauthorized = await requireAdmin(request, env as any);
  if (unauthorized) return unauthorized;

  if (!env.IMAGES_BUCKET) {
    return json({ ok: false, code: 'MISSING_R2' }, 500, corsHeaders(request));
  }
  if (!env.DB) {
    return json({ ok: false, code: 'DB_ERROR', detail: 'Missing DB binding' }, 500, corsHeaders(request));
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json({ ok: false, code: 'BAD_MULTIPART' }, 400, corsHeaders(request));
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return json({ ok: false, code: 'UPLOAD_TOO_LARGE' }, 413, corsHeaders(request));
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, code: 'BAD_MULTIPART' }, 400, corsHeaders(request));
  }

  let file: File | null = null;
  const direct = form.get('file');
  if (direct instanceof File) {
    file = direct;
  } else {
    const fallback = form.getAll('files[]').find((entry) => entry instanceof File);
    if (fallback instanceof File) file = fallback;
  }

  if (!file) {
    return json({ ok: false, code: 'BAD_MULTIPART', detail: 'Missing file field' }, 400, corsHeaders(request));
  }

  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(file.type)) {
    return json({ ok: false, code: 'UNSUPPORTED_TYPE' }, 415, corsHeaders(request));
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ ok: false, code: 'UPLOAD_TOO_LARGE' }, 413, corsHeaders(request));
  }

  const url = new URL(request.url);
  const scope = coerceImageScope(url.searchParams.get('scope'));

  const requestedImageId =
    normalizeOptionalString(url.searchParams.get('imageId')) || normalizeOptionalString(form.get('imageId'));

  const entityType = normalizeOptionalString(url.searchParams.get('entityType')) || normalizeOptionalString(form.get('entityType'));
  const entityId = normalizeOptionalString(url.searchParams.get('entityId')) || normalizeOptionalString(form.get('entityId'));
  const kind = normalizeOptionalString(url.searchParams.get('kind')) || normalizeOptionalString(form.get('kind'));
  const isPrimaryRaw = url.searchParams.get('isPrimary') || (form.get('isPrimary') as string | null);
  const sortOrderRaw = url.searchParams.get('sortOrder') || (form.get('sortOrder') as string | null);
  const isPrimary = isPrimaryRaw === '1' || isPrimaryRaw === 'true' ? 1 : 0;
  const sortOrder = normalizeSortOrder(sortOrderRaw);

  let imageId = requestedImageId || crypto.randomUUID();
  let storageKey: string;
  let existing: ExistingImage | null = null;

  if (requestedImageId) {
    existing = await env.DB.prepare(`SELECT id, storage_key FROM images WHERE id = ? LIMIT 1;`).bind(requestedImageId).first<ExistingImage>();
    if (!existing?.id) {
      return json({ ok: false, code: 'BAD_INPUT', detail: 'Unknown imageId' }, 400, corsHeaders(request));
    }
    storageKey = existing.storage_key || buildImageStorageKey(env, scope, file.type);
  } else {
    storageKey = buildImageStorageKey(env, scope, file.type);
  }

  try {
    await env.IMAGES_BUCKET.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name },
    });
  } catch (error) {
    console.error('[admin/images/upload] R2 put failed', error);
    return json({ ok: false, code: 'R2_PUT_FAILED' }, 500, corsHeaders(request));
  }

  const publicUrl = normalizeImageUrl(buildImagesPublicUrl(storageKey));
  const nowIso = new Date().toISOString();

  if (existing?.id) {
    const updated = await env.DB.prepare(
      `UPDATE images
       SET storage_provider = 'r2',
           storage_key = ?,
           public_url = ?,
           content_type = ?,
           size_bytes = ?,
           original_filename = ?,
           entity_type = ?,
           entity_id = ?,
           kind = ?,
           is_primary = ?,
           sort_order = ?
       WHERE id = ?;`
    )
      .bind(
        storageKey,
        publicUrl,
        file.type,
        file.size,
        file.name,
        entityType,
        entityId,
        kind,
        isPrimary,
        sortOrder,
        imageId
      )
      .run();

    if (!updated.success) {
      return json({ ok: false, code: 'DB_ERROR', detail: updated.error || 'Update failed' }, 500, corsHeaders(request));
    }
  } else {
    const inserted = await env.DB.prepare(
      `INSERT INTO images (
          id,
          storage_provider,
          storage_key,
          public_url,
          content_type,
          size_bytes,
          original_filename,
          entity_type,
          entity_id,
          kind,
          is_primary,
          sort_order,
          created_at
        )
        VALUES (?, 'r2', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
    )
      .bind(
        imageId,
        storageKey,
        publicUrl,
        file.type,
        file.size,
        file.name,
        entityType,
        entityId,
        kind,
        isPrimary,
        sortOrder,
        nowIso
      )
      .run();

    if (!inserted.success) {
      return json({ ok: false, code: 'DB_ERROR', detail: inserted.error || 'Insert failed' }, 500, corsHeaders(request));
    }
  }

  return json(
    {
      ok: true,
      image: {
        id: imageId,
        storageKey,
        publicUrl,
      },
    },
    200,
    corsHeaders(request)
  );
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') return onRequestOptions(context);
  if (method === 'POST') return onRequestPost(context);
  return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, corsHeaders(context.request));
}
