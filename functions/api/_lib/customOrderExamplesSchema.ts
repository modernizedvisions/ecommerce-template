type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

const CUSTOM_ORDER_EXAMPLES_TABLE = `
  CREATE TABLE IF NOT EXISTS custom_order_examples (
    id TEXT PRIMARY KEY,
    image_url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export async function ensureCustomOrderExamplesSchema(db: D1Database) {
  await db.prepare(CUSTOM_ORDER_EXAMPLES_TABLE).run();
}
