import { ensureCustomOrderExamplesSchema } from '../_lib/customOrderExamplesSchema';
import { normalizeImageUrl } from '../lib/images';

type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ExampleRow = {
  id: string;
  image_url: string | null;
  title: string | null;
  description: string | null;
  tags_json?: string | null;
  sort_order?: number | null;
  is_active?: number | null;
  created_at?: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet(context: { env: { DB: D1Database; PUBLIC_IMAGES_BASE_URL?: string }; request: Request }) {
  try {
    const db = context.env.DB;
    await ensureCustomOrderExamplesSchema(db);
    const { results } = await db
      .prepare(
        `SELECT id, image_url, title, description, tags_json, sort_order, is_active, created_at
         FROM custom_order_examples
         WHERE is_active = 1
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 9;`
      )
      .all<ExampleRow>();

    const examples = (results || [])
      .filter((row) => row?.image_url)
      .map((row) => ({
        id: row.id,
        imageUrl: normalizeImageUrl(row.image_url as string, context.request, context.env),
        title: row.title || '',
        description: row.description || '',
        tags: parseTags(row.tags_json),
      }));

    return json({ examples });
  } catch (error) {
    console.error('[custom-orders/examples] fetch failed', error);
    return json({ error: 'Failed to load examples' }, 500);
  }
}

const parseTags = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).trim()).filter(Boolean);
    }
  } catch {
    // ignore JSON parse errors
  }
  return [];
};
