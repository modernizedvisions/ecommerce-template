import { requireAdmin } from '../_lib/adminAuth';
import { ensureEmailListSchema, jsonResponse, type EmailListEnv, type EmailListItemRow } from '../_lib/emailList';

type EmailListItem = {
  id: string;
  email: string;
  created_at: string;
};

export async function onRequestGet(
  context: { request: Request; env: EmailListEnv & Record<string, string | undefined> }
): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any, { requireHeaderPassword: true });
  if (unauthorized) return unauthorized;

  try {
    await ensureEmailListSchema(context.env.DB);
    const { results } = await context.env.DB.prepare(
      `SELECT id, email, created_at
       FROM email_list
       ORDER BY datetime(created_at) DESC;`
    ).all<EmailListItemRow>();

    const items: EmailListItem[] = (results || []).map((row) => ({
      id: row.id,
      email: row.email,
      created_at: row.created_at,
    }));

    return jsonResponse({ ok: true, items });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to load email list.', detail }, 500);
  }
}

export async function onRequest(
  context: { request: Request; env: EmailListEnv & Record<string, string | undefined> }
): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestGet(context);
}

