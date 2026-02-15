type Env = {
  IMAGES_BUCKET?: R2Bucket;
  IMAGE_STORAGE_PREFIX?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const guessContentType = (key: string) => {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
};

const normalizePrefix = (value?: string): string => {
  const trimmed = (value || 'site').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed || 'site';
};

export async function onRequest(context: {
  request: Request;
  env: Env;
  next: (input?: Request | string) => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/images/')) {
    return context.next();
  }

  const method = context.request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const storageKey = decodeURIComponent(url.pathname.replace(/^\/images\//, ''));
  if (!storageKey) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  const requiredPrefix = `${normalizePrefix(context.env.IMAGE_STORAGE_PREFIX)}/`;
  if (!storageKey.startsWith(requiredPrefix)) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  if (!context.env.IMAGES_BUCKET) {
    console.error('[images/middleware] missing IMAGES_BUCKET binding');
    return json({ ok: false, code: 'MISSING_R2' }, 500);
  }

  try {
    const object = await context.env.IMAGES_BUCKET.get(storageKey);
    if (!object) {
      return json({ ok: false, code: 'NOT_FOUND' }, 404);
    }

    const headers = new Headers();

    if (typeof (object as any).writeHttpMetadata === 'function') {
      (object as any).writeHttpMetadata(headers);
    }

    const contentType = headers.get('Content-Type') || object.httpMetadata?.contentType || guessContentType(storageKey);
    if (contentType) headers.set('Content-Type', contentType);

    const etag = (object as any).httpEtag || object.etag;
    if (etag) headers.set('ETag', etag);

    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(method === 'HEAD' ? null : object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[images/middleware] fetch failed', error);
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }
}
