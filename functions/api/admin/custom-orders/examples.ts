import { requireAdmin } from '../../_lib/adminAuth';
import { ensureCustomOrderExamplesSchema } from '../../_lib/customOrderExamplesSchema';
import { normalizeImageUrl, resolveImageIdsToUrls, resolveImageUrlsToIds } from '../../_lib/images';

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
  image_id?: string | null;
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
  env: { DB: D1Database };
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  try {
    const db = context.env.DB;
    await ensureCustomOrderExamplesSchema(db);
    const { results } = await db
      .prepare(
        `SELECT id, image_url, image_id, title, description, tags_json, sort_order, is_active, created_at
         FROM custom_order_examples
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<ExampleRow>();

    const ids = (results || []).map((row) => row.image_id || '').filter(Boolean);
    const idToUrl = await resolveImageIdsToUrls(db as any, ids);

    const examples = (results || []).map((row) => {
      const resolvedUrl = row.image_id ? idToUrl.get(row.image_id) || row.image_url || '' : row.image_url || '';
      return {
        id: row.id,
        imageUrl: resolvedUrl ? normalizeImageUrl(resolvedUrl) : '',
        imageId: row.image_id || undefined,
        title: row.title || '',
        description: row.description || '',
        tags: parseTags(row.tags_json),
        sortOrder: row.sort_order ?? 0,
        isActive: row.is_active !== 0,
      };
    });

    return json({ examples });
  } catch (error) {
    console.error('[admin/custom-orders/examples] fetch failed', error);
    return json({ error: 'Failed to load examples' }, 500);
  }
}

export async function onRequestPut(context: {
  env: { DB: D1Database };
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  try {
    const db = context.env.DB;
    await ensureCustomOrderExamplesSchema(db);

    const body = (await context.request.json().catch(() => null)) as any;
    if (!Array.isArray(body?.examples)) {
      return json({ error: 'Invalid payload', detail: 'examples must be an array' }, 400);
    }

    const incoming = body.examples.slice(0, 9);
    const urlsForLookup: string[] = [];

    const normalized = incoming.map((item: any, idx: number) => {
      const rawUrl = typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : '';
      const imageUrl = normalizeImageUrl(rawUrl);
      if (imageUrl && (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:'))) {
        throw new Error('Image URLs must be normal URLs (no data/blob URLs).');
      }
      if (imageUrl && imageUrl.length > MAX_URL_LENGTH) {
        throw new Error(`Image URL too long (max ${MAX_URL_LENGTH} chars).`);
      }
      if (imageUrl) urlsForLookup.push(imageUrl);
      const isActive = typeof item?.isActive === 'boolean' ? item.isActive : !!imageUrl;

      return {
        id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
        imageUrl,
        imageId: typeof item?.imageId === 'string' && item.imageId.trim() ? item.imageId.trim() : null,
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        description: typeof item?.description === 'string' ? item.description.trim() : '',
        tags: normalizeTags(item?.tags),
        sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : idx,
        isActive,
      };
    });

    const urlMap = await resolveImageUrlsToIds(db as any, urlsForLookup);

    await db.prepare(`DELETE FROM custom_order_examples;`).run();

    for (let i = 0; i < normalized.length; i += 1) {
      const example = normalized[i];
      const resolvedImageId = example.imageId || (example.imageUrl ? urlMap.get(example.imageUrl) || null : null);
      const inserted = await db
        .prepare(
          `INSERT INTO custom_order_examples (
            id,
            image_url,
            image_id,
            title,
            description,
            tags_json,
            sort_order,
            is_active,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
        .bind(
          example.id,
          example.imageUrl,
          resolvedImageId,
          example.title,
          example.description,
          JSON.stringify(example.tags),
          i,
          example.isActive ? 1 : 0,
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();

      if (!inserted.success) {
        throw new Error(inserted.error || 'Insert failed');
      }
    }

    return onRequestGet(context);
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
    // ignore
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
