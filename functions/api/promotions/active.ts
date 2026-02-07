type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type PromotionRow = {
  id: string;
  name: string | null;
  percent_off: number | null;
  scope: string | null;
  category_slugs_json: string | null;
  banner_enabled: number | null;
  banner_text: string | null;
  starts_at: string | null;
  ends_at: string | null;
  enabled: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  });

const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const parseCategorySlugs = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => typeof v === 'string')
      .map((v) => normalizeCategoryKey(v))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const withinWindow = (nowMs: number, startsAt?: string | null, endsAt?: string | null): boolean => {
  if (startsAt) {
    const startMs = Date.parse(startsAt);
    if (!Number.isFinite(startMs) || nowMs < startMs) return false;
  }
  if (endsAt) {
    const endMs = Date.parse(endsAt);
    if (!Number.isFinite(endMs) || nowMs > endMs) return false;
  }
  return true;
};

const mapRowToPromotion = (row: PromotionRow, nowMs: number) => {
  if (!row || row.enabled !== 1) return null;
  if (!withinWindow(nowMs, row.starts_at, row.ends_at)) return null;
  return {
    id: row.id,
    name: row.name || '',
    percentOff: Math.max(0, Number(row.percent_off || 0)),
    scope: row.scope === 'categories' ? 'categories' : 'global',
    categorySlugs: parseCategorySlugs(row.category_slugs_json),
    bannerEnabled: row.banner_enabled === 1,
    bannerText: row.banner_text || '',
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    enabled: row.enabled === 1,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

export const onRequestGet = async (context: { env: { DB: D1Database } }) => {
  const { env } = context;
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  try {
    const row = await env.DB.prepare(
      `
        SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
               starts_at, ends_at, enabled, created_at, updated_at
        FROM promotions
        WHERE enabled = 1
          AND (starts_at IS NULL OR starts_at <= ?)
          AND (ends_at IS NULL OR ends_at >= ?)
        ORDER BY updated_at DESC
        LIMIT 1;
      `
    )
      .bind(nowIso, nowIso)
      .first<PromotionRow>();

    const promotion = row ? mapRowToPromotion(row, nowMs) : null;
    return json(
      { promotion: promotion || null },
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  } catch (error) {
    const message = (error as Error)?.message || '';
    if (/no such table/i.test(message)) {
      return json(
        { promotion: null },
        200,
        { 'Cache-Control': 'public, max-age=60' }
      );
    }
    console.error('Failed to load active promotion', error);
    return json({ error: 'Failed to load active promotion' }, 500);
  }
};
