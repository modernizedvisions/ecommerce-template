import { COOKIE_NAME, parseCookie, verifyAdminSession } from './adminSession';

type AdminAuthEnv = {
  ADMIN_SESSION_SECRET?: string;
};

export const requireAdmin = async (request: Request, env: AdminAuthEnv): Promise<Response | null> => {
  const secret = env?.ADMIN_SESSION_SECRET || '';
  if (!secret) {
    // Treat as misconfiguration to avoid silently allowing auth-less access.
    return Response.json({ ok: false, code: 'MISSING_SESSION_SECRET' }, { status: 500 });
  }

  const token = parseCookie(request.headers.get('Cookie'), COOKIE_NAME);
  if (!token) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const payload = await verifyAdminSession(token, secret);
  if (!payload) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }

  return null;
};
