type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type EmailListEnv = {
  DB: D1Database;
};

export type EmailListItemRow = {
  id: string;
  email: string;
  created_at: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const nowIso = () => new Date().toISOString();

export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320) return null;
  if (!EMAIL_REGEX.test(email)) return null;
  return email;
};

export async function ensureEmailListSchema(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS email_list (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );`
    )
    .run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_email ON email_list(email);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_created_at ON email_list(created_at);`).run();
}

