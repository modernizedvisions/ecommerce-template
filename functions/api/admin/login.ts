import { buildSetCookie, signAdminSession } from '../_lib/adminSession';

type Env = {
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  NODE_ENV?: string;
  CF_PAGES?: string;
};

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ ok: false, error: 'Missing ADMIN_PASSWORD or ADMIN_SESSION_SECRET' }, 500);
  }

  let body: { password?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!body?.password || body.password !== env.ADMIN_PASSWORD) {
    return json({ ok: false }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 8;
  const token = await signAdminSession({ sub: 'admin', iat: now, exp }, env.ADMIN_SESSION_SECRET);
  const isSecure =
    request.url.startsWith('https://') ||
    request.headers.get('x-forwarded-proto') === 'https' ||
    env.NODE_ENV === 'production' ||
    env.CF_PAGES === '1';
  const setCookie = buildSetCookie(token, { maxAge: exp - now, secure: isSecure, sameSite: 'Strict' });

  return json({ ok: true }, 200, { 'Set-Cookie': setCookie });
};
