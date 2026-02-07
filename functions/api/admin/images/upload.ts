import { buildImagesPublicUrl, ensureImagesSchema } from '../../lib/images';
import { requireAdmin } from '../../_lib/adminAuth';

type Env = {
  IMAGES_BUCKET?: R2Bucket;
  PUBLIC_IMAGES_BASE_URL?: string;
  IMAGE_DEBUG?: string;
  ADMIN_PASSWORD?: string;
  DB?: {
    prepare(query: string): {
      bind(...values: unknown[]): any;
      run(): Promise<{ success: boolean; error?: string }>;
    };
  };
};

const BUILD_FINGERPRINT = 'upload-fingerprint-2025-12-21-a';
const DEFAULT_SCOPE = 'products';
const VALID_SCOPES = new Set(['products', 'gallery', 'home', 'categories', 'custom-orders']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Request-Id, X-Admin-Password',
  };
};

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const withFingerprint = <T extends Record<string, unknown>>(data: T) => ({
  ...data,
  fingerprint: BUILD_FINGERPRINT,
});

const extensionForMime = (mime: string) => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
};

const resolveScope = (request: Request) => {
  const url = new URL(request.url);
  const scope = (url.searchParams.get('scope') || '').toLowerCase();
  return VALID_SCOPES.has(scope) ? scope : DEFAULT_SCOPE;
};

export async function onRequestOptions(context: { request: Request }): Promise<Response> {
  const { request } = context;
  console.log('[images/upload] handler', {
    handler: 'OPTIONS',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    requestId: request.headers.get('x-upload-request-id'),
    scope: resolveScope(request),
  });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(context.request),
      'X-Upload-Fingerprint': BUILD_FINGERPRINT,
    },
  });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request } = context;
  const unauthorized = await requireAdmin(request, context.env);
  if (unauthorized) return unauthorized;
  console.log('[images/upload] handler', {
    handler: 'GET',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    userAgent: request.headers.get('user-agent') || '',
    referer: request.headers.get('referer') || '',
    requestId: request.headers.get('x-upload-request-id'),
    scope: resolveScope(request),
  });
  return json(
    withFingerprint({
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed. Use POST.',
      method: request.method,
      path: request.url,
    }),
    405,
    corsHeaders(request)
  );
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const contentType = request.headers.get('content-type') || '';
  const contentLength = request.headers.get('content-length') || '';
  const scope = resolveScope(request);
  const url = new URL(request.url);
  const rid = url.searchParams.get('rid') || '';

  console.log('[images/upload] handler', {
    handler: 'POST',
    method: request.method,
    url: request.url,
    contentType,
    requestId: request.headers.get('x-upload-request-id'),
    scope,
  });

  try {
    const unauthorized = await requireAdmin(request, env);
    if (unauthorized) return unauthorized;

    if (!env.IMAGES_BUCKET) {
      return json(
        withFingerprint({
          ok: false,
          code: 'MISSING_R2',
          message: 'Missing IMAGES_BUCKET binding',
          rid,
          scope,
          debug: env.IMAGE_DEBUG === '1'
            ? {
                envPresent: {
                  IMAGES_BUCKET: !!env.IMAGES_BUCKET,
                  PUBLIC_IMAGES_BASE_URL: !!env.PUBLIC_IMAGES_BASE_URL,
                },
              }
            : undefined,
        }),
        500,
        corsHeaders(request)
      );
    }

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return json(
        withFingerprint({
          ok: false,
          code: 'BAD_MULTIPART',
          message: 'Expected multipart/form-data upload',
          rid,
          scope,
        }),
        400,
        corsHeaders(request)
      );
    }

    const lengthValue = Number(contentLength);
    if (Number.isFinite(lengthValue) && lengthValue > MAX_UPLOAD_BYTES) {
      return json(
        withFingerprint({
          ok: false,
          code: 'UPLOAD_TOO_LARGE',
          message: 'Upload too large',
          rid,
          scope,
        }),
        413,
        corsHeaders(request)
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      console.error('[images/upload] Failed to parse form data', err);
      return json(
        withFingerprint({
          ok: false,
          code: 'BAD_MULTIPART',
          message: 'Invalid form data',
          rid,
          scope,
        }),
        400,
        corsHeaders(request)
      );
    }

    let file = form.get('file');
    if (!file) {
      const files = form.getAll('files[]');
      file = files.find((entry) => entry instanceof File) || null;
    }

    if (!file || !(file instanceof File)) {
      return json(
        withFingerprint({
          ok: false,
          code: 'BAD_MULTIPART',
          message: 'Missing file field',
          rid,
          scope,
        }),
        400,
        corsHeaders(request)
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return json(
        withFingerprint({
          ok: false,
          code: 'UNSUPPORTED_TYPE',
          message: 'Unsupported image type',
          rid,
          scope,
        }),
        415,
        corsHeaders(request)
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return json(
        withFingerprint({
          ok: false,
          code: 'UPLOAD_TOO_LARGE',
          message: 'Upload too large',
          rid,
          scope,
        }),
        413,
        corsHeaders(request)
      );
    }

    console.log('[images/upload] file received', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = extensionForMime(file.type);
    const key = `doverdesign/${scope}/${year}/${month}/${crypto.randomUUID()}.${ext}`;

    try {
      await env.IMAGES_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { originalName: file.name },
      });
    } catch (err) {
      console.error('[images/upload] R2 upload failed', err);
      return json(
        withFingerprint({
          ok: false,
          code: 'R2_PUT_FAILED',
          message: 'Image upload failed',
          rid,
          scope,
        }),
        500,
        corsHeaders(request)
      );
    }

    const publicUrl = buildImagesPublicUrl(key, request, env);
    let imageId: string | null = null;
    let warning: string | undefined;

    if (env.DB) {
      try {
        await ensureImagesSchema(env.DB);
        imageId = crypto.randomUUID();
        const entityType = url.searchParams.get('entityType') || (form.get('entityType') as string | null);
        const entityId = url.searchParams.get('entityId') || (form.get('entityId') as string | null);
        const kind = url.searchParams.get('kind') || (form.get('kind') as string | null);
        const isPrimaryRaw = url.searchParams.get('isPrimary') || (form.get('isPrimary') as string | null);
        const sortOrderRaw = url.searchParams.get('sortOrder') || (form.get('sortOrder') as string | null);
        const isPrimary = isPrimaryRaw === '1' || isPrimaryRaw === 'true' ? 1 : 0;
        const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;

        await env.DB.prepare(
          `INSERT INTO images (
            id, storage_provider, storage_key, public_url, content_type, size_bytes,
            original_filename, entity_type, entity_id, kind, is_primary, sort_order, upload_request_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
          .bind(
            imageId,
            'r2',
            key,
            publicUrl,
            file.type,
            file.size,
            file.name,
            entityType || null,
            entityId || null,
            kind || null,
            isPrimary,
            sortOrder,
            rid || request.headers.get('x-upload-request-id') || null
          )
          .run();
      } catch (err) {
        console.error('[images/upload] D1 insert failed', err);
        warning = 'D1_INSERT_FAILED';
        imageId = null;
      }
    }

    return json(
      withFingerprint({
        ok: true,
        image: {
          id: imageId,
          storageKey: key,
          publicUrl,
        },
        warning,
      }),
      200,
      corsHeaders(request)
    );
  } catch (err) {
    const details = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
    console.error('[images/upload] Unexpected error', details);
    return json(
      withFingerprint({
        ok: false,
        code: 'UPLOAD_FAILED',
        message: 'Image upload failed',
        rid,
        scope,
        debug: env.IMAGE_DEBUG === '1' ? { details } : undefined,
      }),
      500,
      corsHeaders(request)
    );
  }
}

