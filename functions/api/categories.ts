import { defaultShopCategoryTiles } from '../../src/lib/db/mockData';
import { normalizeImageUrl } from './lib/images';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CategoryRow = {
  id: string;
  name: string | null;
  subtitle?: string | null;
  slug: string | null;
  image_url?: string | null;
  hero_image_url?: string | null;
  image_id?: string | null;
  hero_image_id?: string | null;
  sort_order?: number | null;
  option_group_label?: string | null;
  option_group_options_json?: string | null;
  show_on_homepage?: number | null;
  shipping_cents?: number | null;
};

type Category = {
  id: string;
  name: string;
  subtitle?: string;
  slug: string;
  imageUrl?: string;
  heroImageUrl?: string;
  imageId?: string;
  heroImageId?: string;
  showOnHomePage: boolean;
  shippingCents?: number | null;
  sortOrder?: number;
  optionGroupLabel?: string | null;
  optionGroupOptions?: string[];
};

const OTHER_ITEMS_CATEGORY = {
  id: 'other-items',
  name: 'Other Items',
  slug: 'other-items',
};

const createCategoriesTable = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtitle TEXT,
    slug TEXT NOT NULL,
    image_url TEXT,
    hero_image_url TEXT,
    image_id TEXT,
    hero_image_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    option_group_label TEXT,
    option_group_options_json TEXT,
    show_on_homepage INTEGER DEFAULT 0,
    shipping_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

const REQUIRED_CATEGORY_COLUMNS: Record<string, string> = {
  show_on_homepage: 'show_on_homepage INTEGER DEFAULT 0',
  slug: 'slug TEXT',
  hero_image_url: 'hero_image_url TEXT',
  subtitle: 'subtitle TEXT',
  image_id: 'image_id TEXT',
  hero_image_id: 'hero_image_id TEXT',
  shipping_cents: 'shipping_cents INTEGER DEFAULT 0',
  sort_order: 'sort_order INTEGER NOT NULL DEFAULT 0',
  option_group_label: 'option_group_label TEXT',
  option_group_options_json: 'option_group_options_json TEXT',
};

export async function onRequestGet(context: {
  env: { DB: D1Database };
  request: Request;
}): Promise<Response> {
  try {
    await ensureCategorySchema(context.env.DB);
    await seedDefaultCategories(context.env.DB);
    await ensureOtherItemsCategory(context.env.DB);

    const { results } = await context.env.DB
      .prepare(
        `SELECT id, name, subtitle, slug, image_url, hero_image_url, image_id, hero_image_id, sort_order, option_group_label, option_group_options_json, show_on_homepage, shipping_cents, created_at
         FROM categories
         ORDER BY sort_order ASC, datetime(created_at) ASC, name ASC`
      )
      .all<CategoryRow>();

    const categories = (results || [])
      .map((row) => mapRowToCategory(row, context.request, context.env))
      .filter((c): c is Category => Boolean(c));

    return new Response(JSON.stringify({ categories }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to load categories', error);
    return new Response(JSON.stringify({ error: 'Failed to load categories' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

const mapRowToCategory = (
  row: CategoryRow,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Category | null => {
  if (!row || !row.id || !row.name || !row.slug) return null;
  const options = parseOptionGroupOptions(row.option_group_options_json);
  const optionGroupLabel = (row.option_group_label || '').trim() || null;
  const optionGroupOptions = optionGroupLabel && options.length ? options : [];
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle || undefined,
    slug: row.slug,
    imageUrl: row.image_url ? normalizeImageUrl(row.image_url, request, env) : undefined,
    heroImageUrl: row.hero_image_url ? normalizeImageUrl(row.hero_image_url, request, env) : undefined,
    imageId: row.image_id || undefined,
    heroImageId: row.hero_image_id || undefined,
    showOnHomePage: row.show_on_homepage === 1,
    shippingCents: row.shipping_cents ?? 0,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    optionGroupLabel: optionGroupLabel,
    optionGroupOptions: optionGroupLabel && optionGroupOptions.length ? optionGroupOptions : undefined,
  };
};

const parseOptionGroupOptions = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  } catch {
    return [];
  }
};

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

async function seedDefaultCategories(db: D1Database) {
  const existing = await db.prepare('SELECT COUNT(*) as count FROM categories').first<{ count: number | string }>();
  const count = typeof existing?.count === 'number' ? existing.count : Number(existing?.count ?? 0);
  if (count > 0) return;

  for (const tile of defaultShopCategoryTiles) {
    const id = tile.id || tile.categorySlug || crypto.randomUUID();
    const name = tile.label;
    const slug = tile.categorySlug || toSlug(tile.label);
    const imageUrl = tile.imageUrl || null;
    await db
      .prepare(
        `INSERT OR IGNORE INTO categories (id, name, slug, image_url, hero_image_url, show_on_homepage) VALUES (?, ?, ?, ?, ?, ?);`
      )
      .bind(id, name, slug, imageUrl, imageUrl, 1)
      .run();
  }
}

async function ensureCategorySchema(db: D1Database) {
  await db.prepare(createCategoriesTable).run();

  for (const ddl of Object.values(REQUIRED_CATEGORY_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE categories ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error('Failed to add column to categories', error);
      }
    }
  }

  // Backfill missing slugs/show_on_homepage values for existing rows if any
  const { results } = await db
    .prepare(`SELECT id, name FROM categories WHERE slug IS NULL OR slug = ''`)
    .all<{ id: string; name: string | null }>();
  if (results && results.length) {
    for (const row of results) {
      if (!row?.id || !row?.name) continue;
      const slug = toSlug(row.name);
      await db.prepare(`UPDATE categories SET slug = ? WHERE id = ?;`).bind(slug, row.id).run();
    }
  }
  await db.prepare(`UPDATE categories SET show_on_homepage = 0 WHERE show_on_homepage IS NULL;`).run();
  await db.prepare(`UPDATE categories SET sort_order = 0 WHERE sort_order IS NULL;`).run();
  await db
    .prepare(
      `UPDATE categories SET hero_image_url = image_url WHERE (hero_image_url IS NULL OR hero_image_url = '') AND image_url IS NOT NULL;`
    )
    .run();
}

async function ensureOtherItemsCategory(db: D1Database) {
  try {
    const existing = await db
      .prepare(`SELECT id, slug, name FROM categories WHERE LOWER(slug) IN (?, ?) OR LOWER(name) = ? LIMIT 1;`)
      .bind(OTHER_ITEMS_CATEGORY.slug, 'uncategorized', OTHER_ITEMS_CATEGORY.name.toLowerCase())
      .first<{ id: string | null; slug?: string | null; name?: string | null }>();

    if (existing?.id) {
      const normalizedSlug = toSlug(existing.slug || existing.name || '');
      if (normalizedSlug !== OTHER_ITEMS_CATEGORY.slug) {
        await db
          .prepare(`UPDATE categories SET slug = ?, name = ?, show_on_homepage = 1 WHERE id = ?;`)
          .bind(OTHER_ITEMS_CATEGORY.slug, OTHER_ITEMS_CATEGORY.name, existing.id)
          .run();
      }
      return existing.id;
    }

    const id = OTHER_ITEMS_CATEGORY.id || crypto.randomUUID();
    await db
      .prepare(`INSERT INTO categories (id, name, slug, show_on_homepage) VALUES (?, ?, ?, 1);`)
      .bind(id, OTHER_ITEMS_CATEGORY.name, OTHER_ITEMS_CATEGORY.slug)
      .run();
    return id;
  } catch (error) {
    console.error('Failed to ensure Other Items category', error);
    return null;
  }
}
