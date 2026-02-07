import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type SiteContentRow = {
  key: string;
  json: string;
  updated_at?: string | null;
};

const HOME_KEY = 'home';
const MAX_URL_LENGTH = 2000;
const isDataUrl = (value?: string | null) => typeof value === 'string' && value.trim().toLowerCase().startsWith('data:');

const createSiteContentTable = `
  CREATE TABLE IF NOT EXISTS site_content (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const ensureSiteContent = async (db: D1Database) => {
  await db.prepare(createSiteContentTable).run();
  await db
    .prepare(`INSERT OR IGNORE INTO site_content (key, json) VALUES (?, ?);`)
    .bind(HOME_KEY, '{}')
    .run();
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  const db = context.env.DB;

  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureSiteContent(db);

    if (method === 'GET') {
      const row = await db
        .prepare(`SELECT key, json, updated_at FROM site_content WHERE key = ?;`)
        .bind(HOME_KEY)
        .first<SiteContentRow>();
      const parsed = row?.json ? JSON.parse(row.json) : {};
      return json({ key: HOME_KEY, json: parsed, updatedAt: row?.updated_at || null });
    }

    if (method === 'PUT') {
      const body = (await context.request.json().catch(() => null)) as any;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const incomingKey = body.key || (body.home ? HOME_KEY : undefined) || HOME_KEY;
      const incomingJson = body.json ?? body.home ?? null;
      if (incomingKey !== HOME_KEY) {
        return json({ error: 'Invalid key', detail: 'Only home content is supported.' }, 400);
      }
      if (!incomingJson || typeof incomingJson !== 'object') {
        return json({ error: 'Invalid payload', detail: 'Expected { key, json } or { home } object.' }, 400);
      }

      const heroImages = incomingJson?.heroImages || {};
      const homeGallery = Array.isArray(incomingJson?.homeGallery)
        ? incomingJson.homeGallery
        : [];
      const aboutImages = incomingJson?.aboutImages || {};

      const homeGalleryUrls = homeGallery
        .map((item: any) => item?.imageUrl)
        .filter(Boolean) as string[];
      const aboutUrls = [aboutImages.home, aboutImages.about].filter(Boolean) as string[];

      const urlValues = [
        heroImages.left,
        heroImages.middle,
        heroImages.right,
        ...homeGalleryUrls,
        ...aboutUrls,
      ].filter(Boolean) as string[];

      const invalid = urlValues.find((url) => isDataUrl(url) || url.length > MAX_URL_LENGTH);
      if (invalid) {
        return json(
          { error: 'invalid_image_url', detail: 'Image URLs must be normal URLs and under 2000 characters.' },
          400
        );
      }

      const payload = JSON.stringify(incomingJson);
      const result = await db
        .prepare(`UPDATE site_content SET json = ?, updated_at = (datetime('now')) WHERE key = ?;`)
        .bind(payload, HOME_KEY)
        .run();

      if (!result.success) {
        return json({ error: 'Failed to save site content' }, 500);
      }

      return json({ key: HOME_KEY, json: incomingJson });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('[admin/site-content] error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}

