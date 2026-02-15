type Env = {
  IMAGES_BUCKET?: R2Bucket;
  PUBLIC_IMAGES_BASE_URL?: string;
  IMAGE_STORAGE_PREFIX?: string;
};

const DEBUG_FINGERPRINT = 'shop-images-state-2025-12-21';

const normalizePrefix = (value?: string) => {
  const trimmed = (value || 'site').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed || 'site';
};

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { env } = context;
  let keys: string[] | null = null;
  let listError: string | null = null;

  if (env.IMAGES_BUCKET?.list) {
    try {
      const result = await env.IMAGES_BUCKET.list({
        prefix: `${normalizePrefix(env.IMAGE_STORAGE_PREFIX)}/`,
        limit: 10,
      });
      keys = result.objects.map((obj) => obj.key);
    } catch (err) {
      listError = err instanceof Error ? err.message : String(err);
      keys = null;
    }
  } else {
    listError = 'list not supported';
  }

  return new Response(
    JSON.stringify({
      fingerprint: DEBUG_FINGERPRINT,
      envPresent: {
        IMAGES_BUCKET: !!env.IMAGES_BUCKET,
        PUBLIC_IMAGES_BASE_URL: !!env.PUBLIC_IMAGES_BASE_URL,
        IMAGE_STORAGE_PREFIX: !!env.IMAGE_STORAGE_PREFIX,
      },
      keys,
      listError,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
