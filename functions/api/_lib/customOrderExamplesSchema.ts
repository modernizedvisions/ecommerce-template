type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

// Migration-driven schema. This helper remains for compatibility but performs no DDL.
export async function ensureCustomOrderExamplesSchema(_db: D1Database) {
  return;
}
