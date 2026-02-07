type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

const BASE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    message TEXT,
    image_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

const REQUIRED_MESSAGE_COLUMNS: Record<string, string> = {
  type: "type TEXT NOT NULL DEFAULT 'message'",
  category_id: 'category_id TEXT',
  category_name: 'category_name TEXT',
  category_ids_json: 'category_ids_json TEXT',
  category_names_json: 'category_names_json TEXT',
  is_read: 'is_read INTEGER NOT NULL DEFAULT 0',
  read_at: 'read_at TEXT',
  inspo_example_id: 'inspo_example_id TEXT',
  inspo_title: 'inspo_title TEXT',
  inspo_image_url: 'inspo_image_url TEXT',
};

export async function ensureMessagesSchema(db: D1Database) {
  await db.prepare(BASE_MESSAGES_TABLE).run();
  const { results } = await db.prepare(`PRAGMA table_info(messages);`).all<{ name: string }>();
  const names = new Set((results || []).map((c) => c.name));

  for (const ddl of Object.values(REQUIRED_MESSAGE_COLUMNS)) {
    const columnName = ddl.split(' ')[0];
    if (names.has(columnName)) continue;
    await db.prepare(`ALTER TABLE messages ADD COLUMN ${ddl};`).run();
    names.add(columnName);
  }
}
