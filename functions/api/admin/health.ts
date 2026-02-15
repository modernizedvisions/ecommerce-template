import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
  IMAGES_BUCKET?: R2Bucket;
};

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const hasColumn = async (db: D1Database, table: string, column: string): Promise<boolean> => {
  const { results } = await db.prepare(`PRAGMA table_info(${table});`).all<{ name: string }>();
  return (results || []).some((row) => row.name === column);
};

const hasTable = async (db: D1Database, table: string): Promise<boolean> => {
  const row = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;`)
    .bind(table)
    .first<{ name: string }>();
  return !!row?.name;
};

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  const checks: CheckResult[] = [];
  const warnings: string[] = [];

  const db = context.env.DB;
  checks.push({ name: 'binding.DB', ok: !!db, detail: db ? 'present' : 'missing' });
  checks.push({ name: 'binding.IMAGES_BUCKET', ok: !!context.env.IMAGES_BUCKET, detail: context.env.IMAGES_BUCKET ? 'present' : 'missing' });

  if (!db) {
    return json({ ok: false, checks, warnings: ['DB binding is required'] }, 500);
  }

  const requiredTables = ['images', 'products', 'categories', 'gallery_images'];
  for (const table of requiredTables) {
    const present = await hasTable(db, table);
    checks.push({ name: `table.${table}`, ok: present, detail: present ? 'present' : 'missing' });
  }

  const requiredColumns: Array<[string, string]> = [
    ['images', 'storage_key'],
    ['images', 'public_url'],
    ['products', 'primary_image_id'],
    ['products', 'image_ids_json'],
    ['categories', 'image_id'],
    ['categories', 'hero_image_id'],
    ['gallery_images', 'image_id'],
    ['custom_order_examples', 'image_id'],
  ];

  for (const [table, column] of requiredColumns) {
    const tableCheck = checks.find((entry) => entry.name === `table.${table}`);
    if (tableCheck && !tableCheck.ok) {
      checks.push({ name: `column.${table}.${column}`, ok: false, detail: 'table missing' });
      continue;
    }
    const present = await hasColumn(db, table, column);
    checks.push({ name: `column.${table}.${column}`, ok: present, detail: present ? 'present' : 'missing' });
  }

  const ok = checks.every((entry) => entry.ok);

  if (!ok) {
    warnings.push('Run D1 migrations remotely and verify Pages bindings.');
  }

  return json({ ok, checks, warnings }, ok ? 200 : 500);
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'GET') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  return onRequestGet(context);
}
