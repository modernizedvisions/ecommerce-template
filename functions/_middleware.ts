type Env = {
  IMAGES_BUCKET?: R2Bucket;
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

export async function onRequest(context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/images/')) {
    return context.next();
  }

  const method = context.request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, 405);
  }

  const storageKey = url.pathname.replace(/^\/images\//, '');
  if (!storageKey) {
    return json({ ok: false, code: 'MISSING_KEY', message: 'Image key is required' }, 400);
  }

  if (!storageKey.startsWith('doverdesign/')) {
    return context.next();
  }

  if (!context.env.IMAGES_BUCKET) {
    console.error('[images/middleware] missing IMAGES_BUCKET binding');
    return json({ ok: false, code: 'MISSING_R2', message: 'Missing IMAGES_BUCKET binding' }, 500);
  }

  try {
    const object = await context.env.IMAGES_BUCKET.get(storageKey);
    if (!object) {
      return json({ ok: false, code: 'NOT_FOUND', message: 'Image not found' }, 404);
    }

    const headers = new Headers();
    const contentType = object.httpMetadata?.contentType || guessContentType(storageKey);
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(method === 'HEAD' ? null : object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[images/middleware] failed', error);
    return json({ ok: false, code: 'FETCH_FAILED', message: 'Image fetch failed' }, 500);
  }
}
