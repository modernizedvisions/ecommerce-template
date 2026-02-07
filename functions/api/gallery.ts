type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
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

const createGalleryTable = `
  CREATE TABLE IF NOT EXISTS gallery_images (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    image_url TEXT,
    image_id TEXT,
    alt_text TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const MAX_URL_LENGTH = 2000;

const isDataUrl = (value: string) => value.trim().toLowerCase().startsWith('data:');

export async function onRequestGet(context: { env: { DB?: D1Database }; request: Request }): Promise<Response> {
  try {
    const db = context.env.DB;
    if (!db) {
      console.error('[api/gallery][get] missing DB binding');
      return json({ error: 'missing_d1_binding', hint: 'Bind D1 as DB in Cloudflare Pages' }, 500);
    }
    const schemaInfo = await ensureGallerySchema(db);
    const { results } = await db
      .prepare(
        `SELECT id, url, image_url, image_id, alt_text, hidden, is_active, sort_order, position, created_at
         FROM gallery_images
         WHERE hidden = 0 OR hidden IS NULL
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<GalleryRow>();

    const images = (results || []).map((row) => mapRowToImage(row, schemaInfo)).filter(Boolean);
    console.log('[api/gallery][get] fetched', { count: images.length });

    return new Response(JSON.stringify({ images }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[api/gallery][get] failed', { message: (error as any)?.message, stack: (error as any)?.stack });
    return json({ error: 'gallery_fetch_failed', detail: (error as any)?.message || 'unknown' }, 500);
  }
}

export async function onRequestPut(context: { env: { DB?: D1Database }; request: Request }): Promise<Response> {
  try {
    const db = context.env.DB;
    const contentType = context.request.headers.get('content-type');
    if (!db) {
      console.error('[api/gallery] missing DB binding');
      return json({ error: 'missing_d1_binding', hint: 'Bind D1 as DB in Cloudflare Pages' }, 500);
    }

    const schemaInfo = await ensureGallerySchema(db);

    let body: any = null;
    try {
      body = await context.request.json();
    } catch (parseError) {
      console.error('[api/gallery] failed to parse JSON body', {
        message: (parseError as any)?.message,
        contentType,
      });
      return json({ error: 'invalid_json_payload' }, 400);
    }

    if (!Array.isArray(body?.images)) {
      return json({ error: 'invalid_payload', detail: 'images must be an array' }, 400);
    }

    const images = body.images;
    console.log('[api/gallery] payload keys', Object.keys(body || {}), 'count', images.length, 'method', context.request.method);

    let normalized: {
      id: string;
      url: string;
      imageId?: string | null;
      alt: string | null;
      hidden: boolean;
      sortOrder: number;
      createdAt: string;
    }[] = [];
    try {
      normalized = images
        .map((img: any, idx: number) => {
          const url = typeof img?.imageUrl === 'string' ? img.imageUrl : typeof img?.url === 'string' ? img.url : null;
          if (!url) return null;
          if (isDataUrl(url)) {
            throw new Error('Gallery images must be URLs (data URLs are not allowed).');
          }
          if (url.length > MAX_URL_LENGTH) {
            throw new Error(`Gallery image URL too long (max ${MAX_URL_LENGTH} chars).`);
          }
          return {
            id: img.id || safeId(`gallery-${idx}`),
            url,
            imageId: typeof img?.imageId === 'string' ? img.imageId : null,
            alt: img.alt || img.title || null,
            hidden: !!img.hidden,
            sortOrder: Number.isFinite(img.position) ? Number(img.position) : idx,
            createdAt: img.createdAt || new Date().toISOString(),
          };
        })
        .filter(Boolean) as {
        id: string;
        url: string;
        alt: string | null;
        hidden: boolean;
        sortOrder: number;
        createdAt: string;
      }[];
    } catch (validationError) {
      const detail = validationError instanceof Error ? validationError.message : 'Invalid image URLs';
      return json({ error: 'invalid_image_url', detail }, 400);
    }

    const statements = [
      db.prepare(`DELETE FROM gallery_images;`),
      ...normalized.map((img) =>
        db
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
      ),
    ];

    try {
      await db.batch(statements);
    } catch (err) {
      console.error('[api/gallery] batch insert failed', {
        message: (err as any)?.message,
        stack: (err as any)?.stack,
      });
      // Fallback to sequential if batch fails
      await db.prepare(`DELETE FROM gallery_images;`).run();
      for (let i = 0; i < normalized.length; i++) {
        const img = normalized[i];
        try {
          await db
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
        } catch (insertErr) {
          console.error('[api/gallery] insert failed', {
            message: (insertErr as any)?.message,
            idx: i,
            id: img.id,
          });
          throw insertErr;
        }
      }
    }

    const refreshed = await db
      .prepare(
        `SELECT id, url, image_url, image_id, alt_text, hidden, is_active, sort_order, position, created_at
         FROM gallery_images
         ORDER BY sort_order ASC, created_at ASC;`
      )
      .all<GalleryRow>();

    const savedImages = (refreshed.results || []).map((row) => mapRowToImage(row, schemaInfo)).filter(Boolean);
    const countRow = await db.prepare(`SELECT COUNT(*) as c FROM gallery_images;`).first<{ c: number }>();
    console.log('[api/gallery] saved', {
      count: savedImages.length,
      storedCount: countRow?.c ?? null,
      method: context.request.method,
      firstUrl: savedImages[0]?.imageUrl || null,
    });

    return new Response(JSON.stringify({ ok: true, count: savedImages.length, images: savedImages }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[api/gallery] failed', { message: (error as any)?.message, stack: (error as any)?.stack });
    return json({ error: 'gallery_save_failed', detail: (error as any)?.message || 'unknown' }, 500);
  }
}

// Allow POST as a convenience in case clients mis-send the verb.
export const onRequestPost = onRequestPut;

function mapRowToImage(row: GalleryRow | null | undefined, _schema: SchemaInfo) {
  if (!row?.id) return null;
  const url = row.url || row.image_url;
  if (!url) return null;
  const hidden = row.hidden !== undefined && row.hidden !== null ? row.hidden === 1 : row.is_active === 0;
  const position = Number.isFinite(row.sort_order) ? (row.sort_order as number) : row.position ?? 0;
  return {
    id: row.id,
    imageUrl: url,
    imageId: row.image_id || undefined,
    alt: row.alt_text || undefined,
    title: row.alt_text || undefined,
    hidden,
    position,
    createdAt: row.created_at || undefined,
  };
}

type SchemaInfo = {
  hasUrl: boolean;
  hasImageUrl: boolean;
  hasHidden: boolean;
  hasSortOrder: boolean;
  hasIsActive: boolean;
};

async function ensureGallerySchema(db: D1Database): Promise<SchemaInfo> {
  await db.prepare(createGalleryTable).run();
  const { results } = await db.prepare(`PRAGMA table_info(gallery_images);`).all<{ name: string }>();
  const names = new Set((results || []).map((c) => c.name));

  const addColumnIfMissing = async (name: string, ddl: string) => {
    if (!names.has(name)) {
      await db.prepare(`ALTER TABLE gallery_images ADD COLUMN ${ddl};`).run();
      names.add(name);
    }
  };

  await addColumnIfMissing('url', 'url TEXT');
  await addColumnIfMissing('image_url', 'image_url TEXT');
  await addColumnIfMissing('image_id', 'image_id TEXT');
  await addColumnIfMissing('alt_text', 'alt_text TEXT');
  await addColumnIfMissing('hidden', 'hidden INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('is_active', 'is_active INTEGER DEFAULT 1');
  await addColumnIfMissing('sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('position', 'position INTEGER DEFAULT 0');
  await addColumnIfMissing('created_at', 'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');

  // Backfill url from image_url if needed
  await db
    .prepare(`UPDATE gallery_images SET url = image_url WHERE (url IS NULL OR url = '') AND image_url IS NOT NULL;`)
    .run();
  // Backfill hidden from is_active if needed
  await db
    .prepare(
      `UPDATE gallery_images SET hidden = CASE WHEN is_active = 0 THEN 1 ELSE 0 END WHERE hidden IS NULL OR hidden NOT IN (0,1);`
    )
    .run();
  // Backfill sort_order from position if needed
  await db
    .prepare(
      `UPDATE gallery_images SET sort_order = COALESCE(sort_order, position, 0) WHERE sort_order IS NULL;`
    )
    .run();

  return {
    hasUrl: names.has('url'),
    hasImageUrl: names.has('image_url'),
    hasHidden: names.has('hidden'),
    hasSortOrder: names.has('sort_order'),
    hasIsActive: names.has('is_active'),
  };
}

function safeId(fallback: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // ignore and fallback
    }
  }
  return `${fallback}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
