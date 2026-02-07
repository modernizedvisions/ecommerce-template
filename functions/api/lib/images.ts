type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ImagesEnv = {
  PUBLIC_IMAGES_BASE_URL?: string;
};

type ImageRow = {
  id: string;
  storage_key: string | null;
  public_url: string | null;
};

const IMAGE_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    storage_provider TEXT,
    storage_key TEXT,
    public_url TEXT,
    content_type TEXT,
    size_bytes INTEGER,
    original_filename TEXT,
    entity_type TEXT,
    entity_id TEXT,
    kind TEXT,
    is_primary INTEGER,
    sort_order INTEGER,
    upload_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

export async function ensureImagesSchema(db: D1Database) {
  await db.prepare(IMAGE_TABLE_DDL).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_images_storage_key ON images(storage_key);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_images_public_url ON images(public_url);`).run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_images_entity ON images(entity_type, entity_id);`)
    .run();
}

export async function ensureProductImageColumns(db: D1Database) {
  const columns = await db.prepare(`PRAGMA table_info(products);`).all<{ name: string }>();
  const names = new Set((columns.results || []).map((col) => col.name));
  if (!names.has('primary_image_id')) {
    await db.prepare(`ALTER TABLE products ADD COLUMN primary_image_id TEXT;`).run();
  }
  if (!names.has('image_ids_json')) {
    await db.prepare(`ALTER TABLE products ADD COLUMN image_ids_json TEXT;`).run();
  }
}

export async function ensureCategoryImageColumns(db: D1Database) {
  const columns = await db.prepare(`PRAGMA table_info(categories);`).all<{ name: string }>();
  const names = new Set((columns.results || []).map((col) => col.name));
  if (!names.has('image_id')) {
    await db.prepare(`ALTER TABLE categories ADD COLUMN image_id TEXT;`).run();
  }
  if (!names.has('hero_image_id')) {
    await db.prepare(`ALTER TABLE categories ADD COLUMN hero_image_id TEXT;`).run();
  }
}

export async function ensureGalleryImageColumns(db: D1Database) {
  const columns = await db.prepare(`PRAGMA table_info(gallery_images);`).all<{ name: string }>();
  const names = new Set((columns.results || []).map((col) => col.name));
  if (!names.has('image_id')) {
    await db.prepare(`ALTER TABLE gallery_images ADD COLUMN image_id TEXT;`).run();
  }
}

export function buildImagesPublicUrl(storageKey: string, request: Request, env: ImagesEnv): string {
  const base =
    (env.PUBLIC_IMAGES_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  const normalizedBase = base.startsWith('http://')
    ? base.replace('http://', 'https://')
    : base;
  return `${normalizedBase}/images/${storageKey}`;
}

export function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/images/')) {
    return trimmed.replace(/^\/images\//, '');
  }
  if (trimmed.startsWith('doverdesign/')) {
    return trimmed;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/images\/(.+)$/);
      if (match?.[1]) return match[1];
      const idx = url.pathname.indexOf('/doverdesign/');
      if (idx >= 0) return url.pathname.slice(idx + 1);
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeImageUrl(
  value: string | null | undefined,
  request: Request,
  env: ImagesEnv
): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/images/')) return trimmed;
  const storageKey = extractStorageKey(trimmed);
  if (storageKey) return `/images/${storageKey}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return trimmed;
}

export async function resolveImageIdsToUrls(
  db: D1Database,
  ids: string[],
  request: Request,
  env: ImagesEnv
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id, storage_key, public_url FROM images WHERE id IN (${placeholders});`)
    .bind(...unique)
    .all<ImageRow>();
  (results || []).forEach((row) => {
    const storageKey = row.storage_key;
    const url =
      row.public_url ||
      (storageKey ? buildImagesPublicUrl(storageKey, request, env) : '');
    if (row.id && url) {
      map.set(row.id, normalizeImageUrl(url, request, env));
    }
  });
  return map;
}

export async function resolveImageUrlsToIds(
  db: D1Database,
  urls: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const normalized = Array.from(new Set(urls.filter(Boolean)));
  if (!normalized.length) return map;

  const storageKeys = normalized
    .map((url) => extractStorageKey(url))
    .filter((key): key is string => typeof key === 'string' && key.length > 0);

  const lookups: Array<{ storage_key?: string; public_url?: string }> = [];
  storageKeys.forEach((key) => lookups.push({ storage_key: key }));
  normalized.forEach((url) => lookups.push({ public_url: url }));

  const clauses: string[] = [];
  const values: string[] = [];
  lookups.forEach((entry) => {
    if (entry.storage_key) {
      clauses.push('storage_key = ?');
      values.push(entry.storage_key);
    } else if (entry.public_url) {
      clauses.push('public_url = ?');
      values.push(entry.public_url);
    }
  });
  if (!clauses.length) return map;

  const { results } = await db
    .prepare(`SELECT id, storage_key, public_url FROM images WHERE ${clauses.join(' OR ')};`)
    .bind(...values)
    .all<ImageRow>();

  (results || []).forEach((row) => {
    const key = row.storage_key || row.public_url || '';
    if (key) {
      map.set(key, row.id);
    }
  });

  normalized.forEach((url) => {
    const key = extractStorageKey(url);
    if (key && map.has(key)) {
      map.set(url, map.get(key) as string);
    }
  });

  return map;
}
