import { ensureEmailListSchema, jsonResponse, normalizeEmail, nowIso, type EmailListEnv } from '../_lib/emailList';

type SubscribeBody = {
  email?: unknown;
};

export async function onRequestPost(context: { request: Request; env: EmailListEnv }): Promise<Response> {
  try {
    const body = (await context.request.json().catch(() => null)) as SubscribeBody | null;
    const email = normalizeEmail(body?.email);
    if (!email) {
      return jsonResponse({ ok: false, error: 'Valid email is required.' }, 400);
    }

    await ensureEmailListSchema(context.env.DB);

    const result = await context.env.DB.prepare(
      `INSERT OR IGNORE INTO email_list (id, email, created_at) VALUES (?, ?, ?);`
    )
      .bind(crypto.randomUUID(), email, nowIso())
      .run();

    const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
    return jsonResponse({
      ok: true,
      alreadySubscribed: changes === 0,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to subscribe email.', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: EmailListEnv }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}

