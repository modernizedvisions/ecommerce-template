import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  ALLOWED_UPLOAD_SCOPES,
  MAX_UPLOAD_BYTES,
  buildImageStorageKey,
  buildImagesPublicUrl,
  coerceImageScope,
} from '../../_lib/images';
import { requireAdmin } from '../../_lib/adminAuth';
import { createR2PresignedPutUrl } from '../../_lib/r2Presign';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
  IMAGE_STORAGE_PREFIX?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
};

type CreateUploadBody = {
  scope?: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
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

const hasPresignConfig = (env: Env): boolean =>
  Boolean(
    env.R2_S3_ACCESS_KEY_ID &&
      env.R2_S3_SECRET_ACCESS_KEY &&
      env.R2_ACCOUNT_ID &&
      env.R2_BUCKET_NAME
  );

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!context.env.DB) {
    return json({ ok: false, code: 'DB_ERROR', detail: 'Missing DB binding' }, 500);
  }

  let body: CreateUploadBody | null = null;
  try {
    body = (await context.request.json()) as CreateUploadBody;
  } catch {
    return json({ ok: false, code: 'BAD_INPUT', detail: 'Invalid JSON body' }, 400);
  }

  const scope = coerceImageScope(body?.scope);
  const filename = normalizeOptionalString(body?.filename);
  const contentType = normalizeOptionalString(body?.contentType) || '';
  const sizeBytes = Number(body?.sizeBytes);

  if (!ALLOWED_UPLOAD_SCOPES.has(scope)) {
    return json({ ok: false, code: 'BAD_INPUT', detail: 'Invalid scope' }, 400);
  }
  if (!filename) {
    return json({ ok: false, code: 'BAD_INPUT', detail: 'filename is required' }, 400);
  }
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
    return json({ ok: false, code: 'UNSUPPORTED_TYPE' }, 415);
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return json({ ok: false, code: 'BAD_INPUT', detail: 'sizeBytes must be a positive number' }, 400);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return json({ ok: false, code: 'UPLOAD_TOO_LARGE' }, 413);
  }

  const imageId = crypto.randomUUID();
  const storageKey = buildImageStorageKey(context.env, scope, contentType);
  const publicUrl = buildImagesPublicUrl(storageKey);
  const nowIso = new Date().toISOString();

  const insert = await context.env.DB.prepare(
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
    ) VALUES (?, 'r2', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
  )
    .bind(
      imageId,
      storageKey,
      publicUrl,
      contentType,
      Math.floor(sizeBytes),
      filename,
      normalizeOptionalString(body?.entityType),
      normalizeOptionalString(body?.entityId),
      normalizeOptionalString(body?.kind),
      body?.isPrimary ? 1 : 0,
      normalizeSortOrder(body?.sortOrder),
      nowIso
    )
    .run();

  if (!insert.success) {
    return json({ ok: false, code: 'DB_ERROR', detail: insert.error || 'Insert failed' }, 500);
  }

  if (!hasPresignConfig(context.env)) {
    return json({
      ok: true,
      mode: 'server',
      image: {
        id: imageId,
        storageKey,
        publicUrl,
      },
      upload: null,
    });
  }

  try {
    const presigned = await createR2PresignedPutUrl({
      accountId: context.env.R2_ACCOUNT_ID as string,
      bucketName: context.env.R2_BUCKET_NAME as string,
      accessKeyId: context.env.R2_S3_ACCESS_KEY_ID as string,
      secretAccessKey: context.env.R2_S3_SECRET_ACCESS_KEY as string,
      storageKey,
      contentType,
      expiresSeconds: 300,
    });

    return json({
      ok: true,
      mode: 'presigned',
      image: {
        id: imageId,
        storageKey,
        publicUrl,
      },
      upload: presigned,
    });
  } catch (error) {
    console.error('[admin/images/create-upload] presign failed', error);
    return json({
      ok: true,
      mode: 'server',
      image: {
        id: imageId,
        storageKey,
        publicUrl,
      },
      upload: null,
    });
  }
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  return onRequestPost(context);
}
