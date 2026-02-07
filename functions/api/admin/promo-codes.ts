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

type PromoCodeRow = {
  id: string;
  code: string | null;
  enabled: number | null;
  percent_off: number | null;
  free_shipping: number | null;
  scope: string | null;
  category_slugs_json: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PromoCodeInput = {
  code?: string;
  enabled?: boolean;
  percentOff?: number | null;
  freeShipping?: boolean;
  scope?: 'global' | 'categories';
  categorySlugs?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
};

const PROMO_CODES_TABLE = `
  CREATE TABLE IF NOT EXISTS promo_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    percent_off INTEGER,
    free_shipping INTEGER NOT NULL DEFAULT 0,
    scope TEXT NOT NULL CHECK (scope IN ('global','categories')),
    category_slugs_json TEXT NOT NULL DEFAULT '[]',
    starts_at TEXT,
    ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;

const REQUIRED_PROMO_COLUMNS: Record<string, string> = {
  enabled: 'enabled INTEGER NOT NULL DEFAULT 0',
  percent_off: 'percent_off INTEGER',
  free_shipping: 'free_shipping INTEGER NOT NULL DEFAULT 0',
  category_slugs_json: "category_slugs_json TEXT NOT NULL DEFAULT '[]'",
  starts_at: 'starts_at TEXT',
  ends_at: 'ends_at TEXT',
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

const normalizePromoCode = (value?: string | null) =>
  (value || '').trim().toLowerCase();

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

const mapRowToPromoCode = (row: PromoCodeRow | null) => {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || '',
    enabled: row.enabled === 1,
    percentOff: row.percent_off ?? null,
    freeShipping: row.free_shipping === 1,
    scope: row.scope === 'categories' ? 'categories' : 'global',
    categorySlugs: parseCategorySlugs(row.category_slugs_json),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const ensurePromoCodeSchema = async (db: D1Database) => {
  await db.prepare(PROMO_CODES_TABLE).run();
  for (const ddl of Object.values(REQUIRED_PROMO_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE promo_codes ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error('Failed to add promo codes column', error);
      }
    }
  }
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_promo_codes_enabled ON promo_codes(enabled);`).run();
};

export async function onRequest(context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  try {
    await ensurePromoCodeSchema(env.DB);

    if (method === 'GET') {
      const { results } = await env.DB
        .prepare(
          `SELECT id, code, enabled, percent_off, free_shipping, scope, category_slugs_json,
                  starts_at, ends_at, created_at, updated_at
           FROM promo_codes
           ORDER BY updated_at DESC;`
        )
        .all<PromoCodeRow>();
      const promoCodes = (results || []).map((row) => mapRowToPromoCode(row));
      return json({ promoCodes });
    }

    if (method === 'POST') {
      const body = (await request.json().catch(() => null)) as PromoCodeInput | null;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const code = normalizePromoCode(body.code);
      if (!code) return json({ error: 'Code is required' }, 400);

      const percentOffRaw = body.percentOff;
      const percentOff =
        percentOffRaw === null || percentOffRaw === undefined || percentOffRaw === ''
          ? null
          : Math.floor(Number(percentOffRaw));
      if (percentOff !== null && (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 90)) {
        return json({ error: 'percentOff must be between 1 and 90' }, 400);
      }

      const freeShipping = !!body.freeShipping;
      if (percentOff === null && !freeShipping) {
        return json({ error: 'percentOff or freeShipping is required' }, 400);
      }

      const scope = body.scope === 'categories' ? 'categories' : 'global';
      const categorySlugs = normalizeCategorySlugs(body.categorySlugs);
      if (scope === 'categories' && categorySlugs.length === 0) {
        return json({ error: 'categorySlugs are required for category promo codes' }, 400);
      }

      const startsAt = parseDateInput(body.startsAt ?? null);
      if (body.startsAt && !startsAt) return json({ error: 'Invalid startsAt value' }, 400);
      const endsAt = parseDateInput(body.endsAt ?? null);
      if (body.endsAt && !endsAt) return json({ error: 'Invalid endsAt value' }, 400);
      const windowError = validateWindow(startsAt, endsAt);
      if (windowError) return json({ error: windowError }, 400);

      const enabled = !!body.enabled;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const insert = await env.DB
        .prepare(
          `
          INSERT INTO promo_codes (
            id, code, enabled, percent_off, free_shipping,
            scope, category_slugs_json, starts_at, ends_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `
        )
        .bind(
          id,
          code,
          enabled ? 1 : 0,
          percentOff,
          freeShipping ? 1 : 0,
          scope,
          JSON.stringify(categorySlugs),
          startsAt,
          endsAt,
          now,
          now
        )
        .run();

      if (!insert.success) {
        if (insert.error && /unique|constraint/i.test(insert.error)) {
          return json({ error: 'Promo code already exists' }, 409);
        }
        return json({ error: 'Failed to create promo code' }, 500);
      }

      const created = await env.DB
        .prepare(
          `SELECT id, code, enabled, percent_off, free_shipping, scope, category_slugs_json,
                  starts_at, ends_at, created_at, updated_at
           FROM promo_codes WHERE id = ?;`
        )
        .bind(id)
        .first<PromoCodeRow>();

      return json({ promoCode: mapRowToPromoCode(created) }, 201);
    }

    if (method === 'PUT') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, 400);

      const body = (await request.json().catch(() => null)) as PromoCodeInput | null;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const existing = await env.DB
        .prepare(
          `SELECT id, code, enabled, percent_off, free_shipping, scope, category_slugs_json,
                  starts_at, ends_at, created_at, updated_at
           FROM promo_codes WHERE id = ?;`
        )
        .bind(id)
        .first<PromoCodeRow>();
      if (!existing) return json({ error: 'Promo code not found' }, 404);

      const sets: string[] = [];
      const values: unknown[] = [];
      const addSet = (clause: string, value: unknown) => {
        sets.push(clause);
        values.push(value);
      };

      if (body.code !== undefined) {
        const code = normalizePromoCode(body.code);
        if (!code) return json({ error: 'Code is required' }, 400);
        const clash = await env.DB
          .prepare(`SELECT id FROM promo_codes WHERE lower(code) = ? AND id != ? LIMIT 1;`)
          .bind(code, id)
          .first<{ id: string }>();
        if (clash?.id) return json({ error: 'Promo code already exists' }, 409);
        addSet('code = ?', code);
      }

      const nextPercentOff =
        body.percentOff === undefined
          ? existing.percent_off
          : body.percentOff === null || body.percentOff === ''
          ? null
          : Math.floor(Number(body.percentOff));
      if (nextPercentOff !== null && (!Number.isFinite(nextPercentOff) || nextPercentOff < 1 || nextPercentOff > 90)) {
        return json({ error: 'percentOff must be between 1 and 90' }, 400);
      }

      const nextFreeShipping = body.freeShipping === undefined ? existing.free_shipping === 1 : !!body.freeShipping;

      if (nextPercentOff === null && !nextFreeShipping) {
        return json({ error: 'percentOff or freeShipping is required' }, 400);
      }

      if (body.percentOff !== undefined) {
        addSet('percent_off = ?', nextPercentOff);
      }
      if (body.freeShipping !== undefined) {
        addSet('free_shipping = ?', nextFreeShipping ? 1 : 0);
      }

      if (body.scope !== undefined) {
        const scope = body.scope === 'categories' ? 'categories' : 'global';
        if (scope === 'categories' && !body.categorySlugs) {
          return json({ error: 'categorySlugs are required for category promo codes' }, 400);
        }
        addSet('scope = ?', scope);
      }

      if (body.categorySlugs !== undefined) {
        const categorySlugs = normalizeCategorySlugs(body.categorySlugs);
        if (body.scope === 'categories' && categorySlugs.length === 0) {
          return json({ error: 'categorySlugs are required for category promo codes' }, 400);
        }
        addSet('category_slugs_json = ?', JSON.stringify(categorySlugs));
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
        body.startsAt !== undefined ? parseDateInput(body.startsAt) : existing.starts_at,
        body.endsAt !== undefined ? parseDateInput(body.endsAt) : existing.ends_at
      );
      if (windowError) return json({ error: windowError }, 400);

      if (body.enabled !== undefined) {
        addSet('enabled = ?', body.enabled ? 1 : 0);
      }

      if (!sets.length) return json({ error: 'No fields to update' }, 400);

      addSet('updated_at = ?', new Date().toISOString());

      const result = await env.DB
        .prepare(`UPDATE promo_codes SET ${sets.join(', ')} WHERE id = ?;`)
        .bind(...values, id)
        .run();

      if (!result.success) return json({ error: 'Failed to update promo code' }, 500);
      if (result.meta?.changes === 0) return json({ error: 'Promo code not found' }, 404);

      const updated = await env.DB
        .prepare(
          `SELECT id, code, enabled, percent_off, free_shipping, scope, category_slugs_json,
                  starts_at, ends_at, created_at, updated_at
           FROM promo_codes WHERE id = ?;`
        )
        .bind(id)
        .first<PromoCodeRow>();

      return json({ promoCode: mapRowToPromoCode(updated) });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, 400);

      const result = await env.DB.prepare(`DELETE FROM promo_codes WHERE id = ?;`).bind(id).run();
      if (!result.success) return json({ error: 'Failed to delete promo code' }, 500);
      if (result.meta?.changes === 0) return json({ error: 'Promo code not found' }, 404);
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin promo codes error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}

