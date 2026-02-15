type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type ImagesEnv = {
  IMAGE_STORAGE_PREFIX?: string;
  PUBLIC_IMAGES_BASE_URL?: string;
};

type ImageRow = {
  id: string;
  storage_key: string | null;
  public_url: string | null;
};

export const DEFAULT_IMAGE_STORAGE_PREFIX = 'site';
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_UPLOAD_SCOPES = new Set([
  'products',
  'gallery',
  'home',
  'categories',
  'custom-orders',
] as const);

export type ImageScope = 'products' | 'gallery' | 'home' | 'categories' | 'custom-orders';

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const normalizeStoragePrefix = (value?: string): string => {
  const normalized = (value || DEFAULT_IMAGE_STORAGE_PREFIX)
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (!normalized) return DEFAULT_IMAGE_STORAGE_PREFIX;

  return normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .join('/');
};

export const getImageStoragePrefix = (env: ImagesEnv): string =>
  normalizeStoragePrefix(env.IMAGE_STORAGE_PREFIX);

export const coerceImageScope = (raw: string | null | undefined): ImageScope => {
  const value = (raw || '').toLowerCase();
  if (ALLOWED_UPLOAD_SCOPES.has(value as ImageScope)) {
    return value as ImageScope;
  }
  return 'products';
};

export const extensionForContentType = (contentType: string): string => {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
};

export const buildImageStorageKey = (
  env: ImagesEnv,
  scope: ImageScope,
  contentType: string,
  now = new Date()
): string => {
  const prefix = getImageStoragePrefix(env);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = extensionForContentType(contentType);
  return `${prefix}/${scope}/${year}/${month}/${crypto.randomUUID()}.${ext}`;
};

export const buildImagesPublicUrl = (storageKey: string, _request?: Request, _env?: ImagesEnv): string => `/images/${storageKey}`;

export const extractStorageKey = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/images/')) {
    return trimmed.replace(/^\/images\//, '');
  }

  if (/^[a-zA-Z0-9._-]+\/.+/.test(trimmed) && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/images\/(.+)$/);
      if (match?.[1]) return match[1];
    } catch {
      return null;
    }
  }

  return null;
};

export function normalizeImageUrl(value: string | null | undefined, _request?: Request, _env?: ImagesEnv): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/images/')) return trimmed;

  const storageKey = extractStorageKey(trimmed);
  if (storageKey) return buildImagesPublicUrl(storageKey);

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return trimmed;
}

export async function resolveImageIdsToUrls(
  db: D1Database,
  ids: string[],
  _request?: Request,
  _env?: ImagesEnv
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
    const resolved = row.public_url || (row.storage_key ? buildImagesPublicUrl(row.storage_key) : '');
    if (row.id && resolved) {
      map.set(row.id, normalizeImageUrl(resolved));
    }
  });

  return map;
}

export async function resolveImageUrlsToIds(
  db: D1Database,
  urls: string[],
  _request?: Request,
  _env?: ImagesEnv
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const normalized = Array.from(new Set(urls.filter(Boolean).map((url) => normalizeImageUrl(url))));
  if (!normalized.length) return map;

  const storageKeys = normalized
    .map((url) => extractStorageKey(url))
    .filter((key): key is string => typeof key === 'string' && key.length > 0);

  const clauses: string[] = [];
  const values: string[] = [];

  storageKeys.forEach((key) => {
    clauses.push('storage_key = ?');
    values.push(key);
  });

  normalized.forEach((url) => {
    clauses.push('public_url = ?');
    values.push(url);
  });

  if (!clauses.length) return map;

  const { results } = await db
    .prepare(`SELECT id, storage_key, public_url FROM images WHERE ${clauses.join(' OR ')};`)
    .bind(...values)
    .all<ImageRow>();

  (results || []).forEach((row) => {
    if (!row.id) return;
    if (row.storage_key) map.set(row.storage_key, row.id);
    if (row.public_url) map.set(normalizeImageUrl(row.public_url), row.id);
  });

  normalized.forEach((url) => {
    const key = extractStorageKey(url);
    if (key && map.has(key)) {
      map.set(url, map.get(key) as string);
    }
  });

  return map;
}

// Migration-driven schema: legacy helpers kept as no-op shims to preserve imports.
export async function ensureImagesSchema(_db: D1Database): Promise<void> {
  return;
}

export async function ensureProductImageColumns(_db: D1Database): Promise<void> {
  return;
}

export async function ensureCategoryImageColumns(_db: D1Database): Promise<void> {
  return;
}

export async function ensureGalleryImageColumns(_db: D1Database): Promise<void> {
  return;
}

