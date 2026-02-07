import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
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

type PromotionInput = {
  name?: string;
  percentOff?: number;
  scope?: 'global' | 'categories';
  categorySlugs?: string[];
  bannerEnabled?: boolean;
  bannerText?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  enabled?: boolean;
};

const PROMOTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    percent_off INTEGER NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('global','categories')),
    category_slugs_json TEXT NOT NULL DEFAULT '[]',
    banner_enabled INTEGER NOT NULL DEFAULT 0,
    banner_text TEXT NOT NULL DEFAULT '',
    starts_at TEXT,
    ends_at TEXT,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;

const REQUIRED_PROMOTION_COLUMNS: Record<string, string> = {
  category_slugs_json: "category_slugs_json TEXT NOT NULL DEFAULT '[]'",
  banner_enabled: 'banner_enabled INTEGER NOT NULL DEFAULT 0',
  banner_text: "banner_text TEXT NOT NULL DEFAULT ''",
  starts_at: 'starts_at TEXT',
  ends_at: 'ends_at TEXT',
  enabled: 'enabled INTEGER NOT NULL DEFAULT 0',
  updated_at: "updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const normalizeCategorySlugs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => normalizeCategoryKey(entry))
    .filter(Boolean);
  return Array.from(new Set(normalized));
};

const parseCategorySlugs = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry === 'string')
      .map((entry) => normalizeCategoryKey(entry))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const parseDateInput = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const validateWindow = (startsAt?: string | null, endsAt?: string | null) => {
  if (!startsAt || !endsAt) return null;
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Invalid schedule window';
  if (startMs > endMs) return 'Start date must be before end date';
  return null;
};

const mapRowToPromotion = (row: PromotionRow | null) => {
  if (!row) return null;
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

const ensurePromotionSchema = async (db: D1Database) => {
  await db.prepare(PROMOTIONS_TABLE).run();
  for (const ddl of Object.values(REQUIRED_PROMOTION_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE promotions ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error('Failed to add promotions column', error);
      }
    }
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_promotions_enabled ON promotions(enabled);`).run();
};

export async function onRequest(context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  try {
    await ensurePromotionSchema(env.DB);

    if (method === 'GET') {
      const { results } = await env.DB
        .prepare(
          `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
                  starts_at, ends_at, enabled, created_at, updated_at
           FROM promotions
           ORDER BY updated_at DESC;`
        )
        .all<PromotionRow>();
      const promotions = (results || []).map((row) => mapRowToPromotion(row));
      return json({ promotions });
    }

    if (method === 'POST') {
      const body = (await request.json().catch(() => null)) as PromotionInput | null;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const name = (body.name || '').trim();
      if (!name) return json({ error: 'Name is required' }, 400);

      const percentOff = Math.floor(Number(body.percentOff ?? 0));
      if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 90) {
        return json({ error: 'percentOff must be between 1 and 90' }, 400);
      }

      const scope = body.scope === 'categories' ? 'categories' : 'global';
      const categorySlugs = normalizeCategorySlugs(body.categorySlugs);
      if (scope === 'categories' && categorySlugs.length === 0) {
        return json({ error: 'categorySlugs are required for category promotions' }, 400);
      }

      const bannerEnabled = !!body.bannerEnabled;
      const bannerText = (body.bannerText || '').trim();
      if (bannerEnabled && !bannerText) {
        return json({ error: 'bannerText is required when bannerEnabled is true' }, 400);
      }

      const startsAt = parseDateInput(body.startsAt ?? null);
      if (body.startsAt && !startsAt) {
        return json({ error: 'Invalid startsAt value' }, 400);
      }
      const endsAt = parseDateInput(body.endsAt ?? null);
      if (body.endsAt && !endsAt) {
        return json({ error: 'Invalid endsAt value' }, 400);
      }
      const windowError = validateWindow(startsAt, endsAt);
      if (windowError) return json({ error: windowError }, 400);

      const enabled = !!body.enabled;
      if (enabled) {
        await env.DB.prepare(`UPDATE promotions SET enabled = 0 WHERE enabled = 1;`).run();
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const insert = await env.DB
        .prepare(
          `
          INSERT INTO promotions (
            id, name, percent_off, scope, category_slugs_json,
            banner_enabled, banner_text, starts_at, ends_at, enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `
        )
        .bind(
          id,
          name,
          percentOff,
          scope,
          JSON.stringify(categorySlugs),
          bannerEnabled ? 1 : 0,
          bannerText,
          startsAt,
          endsAt,
          enabled ? 1 : 0,
          now,
          now
        )
        .run();

      if (!insert.success) return json({ error: 'Failed to create promotion' }, 500);

      const created = await env.DB
        .prepare(
          `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
                  starts_at, ends_at, enabled, created_at, updated_at
           FROM promotions WHERE id = ?;`
        )
        .bind(id)
        .first<PromotionRow>();

      return json({ promotion: mapRowToPromotion(created) }, 201);
    }

    if (method === 'PUT') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, 400);

      const body = (await request.json().catch(() => null)) as PromotionInput | null;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const sets: string[] = [];
      const values: unknown[] = [];

      const addSet = (clause: string, value: unknown) => {
        sets.push(clause);
        values.push(value);
      };

      if (body.name !== undefined) {
        const name = (body.name || '').trim();
        if (!name) return json({ error: 'Name is required' }, 400);
        addSet('name = ?', name);
      }

      if (body.percentOff !== undefined) {
        const percentOff = Math.floor(Number(body.percentOff));
        if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 90) {
          return json({ error: 'percentOff must be between 1 and 90' }, 400);
        }
        addSet('percent_off = ?', percentOff);
      }

      if (body.scope !== undefined) {
        const scope = body.scope === 'categories' ? 'categories' : 'global';
        if (scope === 'categories' && !body.categorySlugs) {
          return json({ error: 'categorySlugs are required for category promotions' }, 400);
        }
        addSet('scope = ?', scope);
      }

      if (body.categorySlugs !== undefined) {
        const categorySlugs = normalizeCategorySlugs(body.categorySlugs);
        if (body.scope === 'categories' && categorySlugs.length === 0) {
          return json({ error: 'categorySlugs are required for category promotions' }, 400);
        }
        addSet('category_slugs_json = ?', JSON.stringify(categorySlugs));
      }

      if (body.bannerEnabled !== undefined) {
        const bannerEnabled = !!body.bannerEnabled;
        if (bannerEnabled && body.bannerText !== undefined && !(body.bannerText || '').trim()) {
          return json({ error: 'bannerText is required when bannerEnabled is true' }, 400);
        }
        addSet('banner_enabled = ?', bannerEnabled ? 1 : 0);
      }

      if (body.bannerText !== undefined) {
        const bannerText = (body.bannerText || '').trim();
        if (body.bannerEnabled && !bannerText) {
          return json({ error: 'bannerText is required when bannerEnabled is true' }, 400);
        }
        addSet('banner_text = ?', bannerText);
      }

      if (body.startsAt !== undefined) {
        const parsed = parseDateInput(body.startsAt);
        if (body.startsAt && !parsed) return json({ error: 'Invalid startsAt value' }, 400);
        addSet('starts_at = ?', parsed);
      }

      if (body.endsAt !== undefined) {
        const parsed = parseDateInput(body.endsAt);
        if (body.endsAt && !parsed) return json({ error: 'Invalid endsAt value' }, 400);
        addSet('ends_at = ?', parsed);
      }

      const windowError = validateWindow(
        body.startsAt !== undefined ? parseDateInput(body.startsAt) : null,
        body.endsAt !== undefined ? parseDateInput(body.endsAt) : null
      );
      if (windowError) return json({ error: windowError }, 400);

      if (body.enabled !== undefined) {
        const enabled = !!body.enabled;
        if (enabled) {
          await env.DB.prepare(`UPDATE promotions SET enabled = 0 WHERE enabled = 1 AND id != ?;`).bind(id).run();
        }
        addSet('enabled = ?', enabled ? 1 : 0);
      }

      if (!sets.length) return json({ error: 'No fields to update' }, 400);

      addSet("updated_at = ?", new Date().toISOString());

      const result = await env.DB
        .prepare(`UPDATE promotions SET ${sets.join(', ')} WHERE id = ?;`)
        .bind(...values, id)
        .run();

      if (!result.success) return json({ error: 'Failed to update promotion' }, 500);
      if (result.meta?.changes === 0) return json({ error: 'Promotion not found' }, 404);

      const updated = await env.DB
        .prepare(
          `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
                  starts_at, ends_at, enabled, created_at, updated_at
           FROM promotions WHERE id = ?;`
        )
        .bind(id)
        .first<PromotionRow>();

      return json({ promotion: mapRowToPromotion(updated) });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, 400);

      const result = await env.DB.prepare(`DELETE FROM promotions WHERE id = ?;`).bind(id).run();
      if (!result.success) return json({ error: 'Failed to delete promotion' }, 500);
      if (result.meta?.changes === 0) return json({ error: 'Promotion not found' }, 404);
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin promotions error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}

