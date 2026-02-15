import { requireAdmin } from './_lib/adminAuth';
import { normalizeImageUrl } from './_lib/images';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type GalleryRow = {
  id: string;
  url?: string | null;
  image_url: string | null;
  image_id?: string | null;
  alt_text?: string | null;
  is_active?: number | null;
  position?: number | null;
  sort_order?: number | null;
  hidden?: number | null;
  created_at?: string | null;
};

const MAX_URL_LENGTH = 2000;

const isDataUrl = (value: string) => value.trim().toLowerCase().startsWith('data:');

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function mapRowToImage(row: GalleryRow | null | undefined) {
  if (!row?.id) return null;
  const url = row.url || row.image_url;
  if (!url) return null;
  const hidden = row.hidden !== undefined && row.hidden !== null ? row.hidden === 1 : row.is_active === 0;
  const position = Number.isFinite(row.sort_order) ? (row.sort_order as number) : row.position ?? 0;
  return {
    id: row.id,
    imageUrl: normalizeImageUrl(url),
    imageId: row.image_id || undefined,
    alt: row.alt_text || undefined,
    title: row.alt_text || undefined,
    hidden,
    position,
    createdAt: row.created_at || undefined,
  };
}

export async function onRequestGet(context: { env: { DB?: D1Database }; request: Request }): Promise<Response> {
  try {
    const db = context.env.DB;
    if (!db) {
      return json({ error: 'missing_d1_binding', hint: 'Bind D1 as DB in Cloudflare Pages' }, 500);
    }

    const { results } = await db
      .prepare(
        `SELECT id, url, image_url, image_id, alt_text, hidden, is_active, sort_order, position, created_at
         FROM gallery_images
         WHERE hidden = 0 OR hidden IS NULL
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<GalleryRow>();

    const images = (results || []).map((row) => mapRowToImage(row)).filter(Boolean);
    return json({ images });
  } catch (error) {
    console.error('[api/gallery][get] failed', error);
    return json({ error: 'gallery_fetch_failed', detail: (error as any)?.message || 'unknown' }, 500);
  }
}

export async function onRequestPut(context: { env: { DB?: D1Database }; request: Request }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  try {
    const db = context.env.DB;
    if (!db) {
      return json({ error: 'missing_d1_binding', hint: 'Bind D1 as DB in Cloudflare Pages' }, 500);
    }

    const body = (await context.request.json().catch(() => null)) as any;
    if (!Array.isArray(body?.images)) {
      return json({ error: 'invalid_payload', detail: 'images must be an array' }, 400);
    }

    const normalized = body.images
      .map((img: any, idx: number) => {
        const url = typeof img?.imageUrl === 'string' ? img.imageUrl : typeof img?.url === 'string' ? img.url : '';
        const normalizedUrl = normalizeImageUrl(url);
        if (!normalizedUrl) return null;
        if (isDataUrl(normalizedUrl)) {
          throw new Error('Gallery images must be URLs (data URLs are not allowed).');
        }
        if (normalizedUrl.length > MAX_URL_LENGTH) {
          throw new Error(`Gallery image URL too long (max ${MAX_URL_LENGTH} chars).`);
        }
        return {
          id: typeof img?.id === 'string' && img.id ? img.id : crypto.randomUUID(),
          url: normalizedUrl,
          imageId: typeof img?.imageId === 'string' && img.imageId ? img.imageId : null,
          alt: typeof img?.alt === 'string' ? img.alt : typeof img?.title === 'string' ? img.title : null,
          hidden: !!img?.hidden,
          sortOrder: Number.isFinite(Number(img?.position)) ? Number(img.position) : idx,
          createdAt: typeof img?.createdAt === 'string' && img.createdAt ? img.createdAt : new Date().toISOString(),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      url: string;
      imageId: string | null;
      alt: string | null;
      hidden: boolean;
      sortOrder: number;
      createdAt: string;
    }>;

    await db.prepare(`DELETE FROM gallery_images;`).run();

    for (const img of normalized) {
      const inserted = await db
        .prepare(
          `INSERT INTO gallery_images (id, url, image_url, image_id, alt_text, hidden, is_active, sort_order, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
        .bind(
          img.id,
          img.url,
          img.url,
          img.imageId,
          img.alt,
          img.hidden ? 1 : 0,
          img.hidden ? 0 : 1,
          img.sortOrder,
          img.sortOrder,
          img.createdAt
        )
        .run();

      if (!inserted.success) {
        throw new Error(inserted.error || 'Failed to persist gallery image');
      }
    }

    const refreshed = await db
      .prepare(
        `SELECT id, url, image_url, image_id, alt_text, hidden, is_active, sort_order, position, created_at
         FROM gallery_images
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<GalleryRow>();

    const images = (refreshed.results || []).map((row) => mapRowToImage(row)).filter(Boolean);
    return json({ ok: true, count: images.length, images });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: 'gallery_save_failed', detail }, 500);
  }
}

export const onRequestPost = onRequestPut;

export async function onRequest(context: { env: { DB?: D1Database }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'PUT') return onRequestPut(context);
  if (method === 'POST') return onRequestPost(context);
  return json({ error: 'method_not_allowed' }, 405);
}
