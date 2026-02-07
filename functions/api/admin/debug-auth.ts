import { parseCookie, COOKIE_NAME } from '../_lib/adminSession';
import { requireAdmin } from '../_lib/adminAuth';

type Env = {
  ADMIN_SESSION_SECRET?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const provided = parseCookie(context.request.headers.get('Cookie'), COOKIE_NAME);
  return json({
    ok: true,
    code: 'AUTHORIZED',
    providedLength: provided?.length ?? 0,
    hasProvided: !!provided,
  });
}

