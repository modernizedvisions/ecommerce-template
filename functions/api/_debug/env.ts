type Env = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_IMAGES_API_TOKEN?: string;
  CLOUDFLARE_IMAGES_VARIANT?: string;
};

const DEBUG_FINGERPRINT = 'debug-env-fingerprint-2025-12-21-a';

const corsHeaders = (request?: Request | null) => ({
  'Access-Control-Allow-Origin': request?.headers.get('Origin') || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const getProcessEnv = (key: string): string | undefined => {
  try {
    const proc = (globalThis as any)?.process;
    const env = proc?.env;
    if (!env) return undefined;
    const value = env[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
};

const resolveImagesEnv = (env: Env) => {
  const hasContextEnv = Boolean(
    env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_IMAGES_API_TOKEN || env.CLOUDFLARE_IMAGES_VARIANT
  );
  const accountId = hasContextEnv
    ? env.CLOUDFLARE_ACCOUNT_ID
    : getProcessEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = hasContextEnv
    ? env.CLOUDFLARE_IMAGES_API_TOKEN
    : getProcessEnv('CLOUDFLARE_IMAGES_API_TOKEN');
  const variant = hasContextEnv ? env.CLOUDFLARE_IMAGES_VARIANT : getProcessEnv('CLOUDFLARE_IMAGES_VARIANT');

  return { accountId, apiToken, variant };
};

export async function onRequestOptions(context: { request: Request }): Promise<Response> {
  const { request } = context;
  console.log('[debug/env] handler', {
    handler: 'OPTIONS',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    requestId: request.headers.get('x-upload-request-id'),
  });
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request),
  });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  console.log('[debug/env] handler', {
    handler: 'GET',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    requestId: request.headers.get('x-upload-request-id'),
  });

  const { accountId, apiToken, variant } = resolveImagesEnv(env);

  return json(
    {
      fingerprint: DEBUG_FINGERPRINT,
      method: request.method,
      path: request.url,
      envPresent: {
        CLOUDFLARE_ACCOUNT_ID: !!accountId,
        CLOUDFLARE_IMAGES_API_TOKEN: !!apiToken,
        CLOUDFLARE_IMAGES_VARIANT: !!variant,
      },
      envPreview: {
        accountIdPrefix: accountId ? accountId.slice(0, 6) : null,
        tokenPrefix: apiToken ? apiToken.slice(0, 6) : null,
      },
    },
    200,
    corsHeaders(request)
  );
}
