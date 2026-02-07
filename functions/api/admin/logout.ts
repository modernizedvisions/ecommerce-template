import { buildSetCookie } from '../_lib/adminSession';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

export const onRequestPost = async (context: { request: Request; env?: { NODE_ENV?: string; CF_PAGES?: string } }): Promise<Response> => {
  const isSecure =
    context.request.url.startsWith('https://') ||
    context.request.headers.get('x-forwarded-proto') === 'https' ||
    context.env?.NODE_ENV === 'production' ||
    context.env?.CF_PAGES === '1';
  const setCookie = buildSetCookie('', { maxAge: 0, secure: isSecure, sameSite: 'Strict' });
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie });
};
