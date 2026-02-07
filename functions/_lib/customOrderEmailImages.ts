import { extractStorageKey } from '../api/lib/images';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ResolveInput = {
  imageUrl?: string | null;
  imageId?: string | null;
  imageStorageKey?: string | null;
  requestUrl?: string | null;
  env?: {
    PUBLIC_SITE_URL?: string;
    VITE_PUBLIC_SITE_URL?: string;
  };
  db?: D1Database;
};

type ResolveResult = {
  url: string | null;
  source: 'image_id' | 'storage_key' | 'image_url' | 'none' | 'invalid';
};

const isBlocked = (value: string | null | undefined) =>
  !value || /^(data|blob):/i.test(value.trim());

const resolveBaseUrl = (input: ResolveInput) => {
  const raw = input.env?.PUBLIC_SITE_URL || input.env?.VITE_PUBLIC_SITE_URL || input.requestUrl || '';
  if (!raw) return '';
  try {
    const base = raw.startsWith('http') ? raw : new URL(raw).origin;
    return base.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
};

const toAbsoluteImagesUrl = (storageKey: string, baseUrl: string) => {
  if (!storageKey) return null;
  if (!baseUrl) return null;
  return `${baseUrl}/images/${storageKey.replace(/^\/+/, '')}`;
};

const normalizeImageUrl = (value: string, baseUrl: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const storageKey = extractStorageKey(trimmed);
  if (storageKey) return toAbsoluteImagesUrl(storageKey, baseUrl);
  if (trimmed.startsWith('/')) {
    return baseUrl ? `${baseUrl}${trimmed}` : null;
  }
  return baseUrl ? `${baseUrl}/${trimmed.replace(/^\/+/, '')}` : null;
};

export async function resolveCustomOrderEmailImage(
  input: ResolveInput
): Promise<ResolveResult> {
  const baseUrl = resolveBaseUrl(input);
  const imageUrl = input.imageUrl || null;
  const imageId = input.imageId || null;
  const imageStorageKey = input.imageStorageKey || null;

  if (imageId && input.db) {
    const row = await input.db
      .prepare(`SELECT storage_key, public_url FROM images WHERE id = ? LIMIT 1;`)
      .bind(imageId)
      .first<{ storage_key: string | null; public_url: string | null }>();
    if (row) {
      const storageKey = row.storage_key || extractStorageKey(row.public_url) || null;
      if (storageKey) {
        return { url: toAbsoluteImagesUrl(storageKey, baseUrl), source: 'image_id' };
      }
      if (row.public_url && !isBlocked(row.public_url)) {
        return { url: normalizeImageUrl(row.public_url, baseUrl), source: 'image_id' };
      }
    }
  }

  if (imageStorageKey && !isBlocked(imageStorageKey)) {
    return { url: toAbsoluteImagesUrl(imageStorageKey, baseUrl), source: 'storage_key' };
  }

  if (imageUrl && !isBlocked(imageUrl)) {
    return { url: normalizeImageUrl(imageUrl, baseUrl), source: 'image_url' };
  }

  return { url: null, source: imageUrl || imageStorageKey || imageId ? 'invalid' : 'none' };
}
