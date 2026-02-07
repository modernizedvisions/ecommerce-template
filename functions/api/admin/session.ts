import { COOKIE_NAME, parseCookie, verifyAdminSession } from '../_lib/adminSession';

type Env = {
  ADMIN_SESSION_SECRET?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.ADMIN_SESSION_SECRET) {
    return json({ authenticated: false, error: 'Missing ADMIN_SESSION_SECRET' }, 500);
  }

  const token = parseCookie(request.headers.get('Cookie'), COOKIE_NAME);
  if (!token) {
    return json({ authenticated: false }, 401);
  }

  const payload = await verifyAdminSession(token, env.ADMIN_SESSION_SECRET);
  if (!payload) {
    return json({ authenticated: false }, 401);
  }

  return json({ authenticated: true }, 200);
};
