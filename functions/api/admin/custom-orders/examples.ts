import { requireAdmin } from '../../_lib/adminAuth';
import { ensureCustomOrderExamplesSchema } from '../../_lib/customOrderExamplesSchema';
import { normalizeImageUrl } from '../../lib/images';

type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
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

const MAX_URL_LENGTH = 2000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet(context: {
  env: { DB: D1Database; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;
  try {
    const db = context.env.DB;
    await ensureCustomOrderExamplesSchema(db);
    const { results } = await db
      .prepare(
        `SELECT id, image_url, title, description, tags_json, sort_order, is_active, created_at
         FROM custom_order_examples
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<ExampleRow>();
    const examples = (results || []).map((row) => ({
      id: row.id,
      imageUrl: row.image_url ? normalizeImageUrl(row.image_url, context.request, context.env) : '',
      title: row.title || '',
      description: row.description || '',
      tags: parseTags(row.tags_json),
      sortOrder: row.sort_order ?? 0,
      isActive: row.is_active !== 0,
    }));
    return json({ examples });
  } catch (error) {
    console.error('[admin/custom-orders/examples] fetch failed', error);
    return json({ error: 'Failed to load examples' }, 500);
  }
}

export async function onRequestPut(context: {
  env: { DB: D1Database; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  try {
    const db = context.env.DB;
    await ensureCustomOrderExamplesSchema(db);
    const body = (await context.request.json().catch(() => null)) as any;
    if (!Array.isArray(body?.examples)) {
      return json({ error: 'Invalid payload', detail: 'examples must be an array' }, 400);
    }

    const incoming = body.examples.slice(0, 9);
    const normalized = incoming.map((item: any, idx: number) => {
      const rawUrl = typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : '';
      if (rawUrl && (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:'))) {
        throw new Error('Image URLs must be normal URLs (no data/blob URLs).');
      }
      if (rawUrl && rawUrl.length > MAX_URL_LENGTH) {
        throw new Error(`Image URL too long (max ${MAX_URL_LENGTH} chars).`);
      }
      const isActive =
        typeof item?.isActive === 'boolean'
          ? item.isActive
          : rawUrl
            ? true
            : false;
      const tags = normalizeTags(item?.tags);
      return {
        id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
        imageUrl: rawUrl || '',
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        description: typeof item?.description === 'string' ? item.description.trim() : '',
        tags,
        sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : idx,
        isActive,
      };
    });

    await db.prepare(`DELETE FROM custom_order_examples;`).run();

    for (let i = 0; i < normalized.length; i += 1) {
      const example = normalized[i];
      await db
        .prepare(
          `INSERT INTO custom_order_examples (
            id,
            image_url,
            title,
            description,
            tags_json,
            sort_order,
            is_active,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
        .bind(
          example.id,
          example.imageUrl,
          example.title,
          example.description,
          JSON.stringify(example.tags),
          i,
          example.isActive ? 1 : 0,
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
    }

    const { results } = await db
      .prepare(
        `SELECT id, image_url, title, description, tags_json, sort_order, is_active, created_at
         FROM custom_order_examples
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<ExampleRow>();

    const examples = (results || []).map((row) => ({
      id: row.id,
      imageUrl: row.image_url ? normalizeImageUrl(row.image_url, context.request, context.env) : '',
      title: row.title || '',
      description: row.description || '',
      tags: parseTags(row.tags_json),
      sortOrder: row.sort_order ?? 0,
      isActive: row.is_active !== 0,
    }));

    return json({ examples });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[admin/custom-orders/examples] save failed', detail);
    return json({ error: 'Failed to save examples', detail }, 500);
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

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
};

