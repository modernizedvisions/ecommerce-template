import { requireAdmin } from '../_lib/adminAuth';
import { ensureMessagesSchema } from '../_lib/messagesSchema';

type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type MessageRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  status?: string | null;
  type?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  is_read?: number | null;
  read_at?: string | null;
  category_ids_json?: string | null;
  category_names_json?: string | null;
  inspo_example_id?: string | null;
  inspo_title?: string | null;
  inspo_image_url?: string | null;
};

const parseJsonArray = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry)).filter(Boolean);
    }
  } catch {
    // ignore parse errors
  }
  return [];
};

export async function onRequestGet(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const db = context.env.DB;

  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureMessagesSchema(db);
    let result;
    try {
      result = await db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all<MessageRow>();
    } catch {
      result = await db.prepare('SELECT * FROM messages ORDER BY id DESC').all<MessageRow>();
    }

    const rows = result.results ?? [];
    const messages = rows.map((row) => {
      let categoryIds = parseJsonArray(row.category_ids_json);
      let categoryNames = parseJsonArray(row.category_names_json);
      if (categoryIds.length === 0 && row.category_id) {
        categoryIds = [row.category_id];
      }
      if (categoryNames.length === 0 && row.category_name) {
        categoryNames = [row.category_name];
      }
      const isRead = row.is_read === 1;
      return {
        id: row.id,
        name: row.name ?? '',
        email: row.email ?? '',
        message: row.message ?? '',
        imageUrl: row.image_url ?? row.imageUrl ?? null,
        createdAt: row.created_at ?? row.createdAt ?? '',
        status: row.status ?? 'new',
        type: row.type ?? 'message',
        categoryId: row.category_id ?? null,
        categoryName: row.category_name ?? null,
        categoryIds,
        categoryNames,
        isRead,
        readAt: row.read_at ?? null,
        inspoExampleId: row.inspo_example_id ?? null,
        inspoTitle: row.inspo_title ?? null,
        inspoImageUrl: row.inspo_image_url ?? null,
      };
    });
    const unreadCount = messages.reduce((count, msg) => count + (msg.isRead ? 0 : 1), 0);

    console.log('[/api/admin/messages] loaded messages count', messages.length);

    return new Response(JSON.stringify({ messages, unreadCount }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/admin/messages] error loading messages', err);
    return new Response(JSON.stringify({ error: 'Failed to load messages' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

