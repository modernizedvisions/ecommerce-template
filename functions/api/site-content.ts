type D1PreparedStatement = {
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet(context: { env: { DB: D1Database } }): Promise<Response> {
  try {
    const db = context.env.DB;
    await ensureSiteContent(db);
    const row = await db
      .prepare(`SELECT key, json, updated_at FROM site_content WHERE key = ?;`)
      .bind(HOME_KEY)
      .first<SiteContentRow>();
    const parsed = row?.json ? JSON.parse(row.json) : {};
    return json(parsed);
  } catch (error) {
    console.error('[site-content] error', error);
    return json({ error: 'Failed to load site content' }, 500);
  }
}
