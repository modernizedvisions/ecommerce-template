import { defaultShopCategoryTiles } from '../../../src/lib/db/mockData';
import {
  ensureImagesSchema,
  normalizeImageUrl,
  resolveImageIdsToUrls,
  resolveImageUrlsToIds,
} from '../lib/images';
import { requireAdmin } from '../_lib/adminAuth';

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

const isDataUrl = (value?: string | null) => typeof value === 'string' && value.trim().toLowerCase().startsWith('data:');

const resolveCategoryImageInput = async (
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string },
  input: { imageId?: string; imageUrl?: string }
): Promise<{ imageId: string | null; imageUrl: string | null }> => {
  const rawId = typeof input.imageId === 'string' ? input.imageId.trim() : '';
  const rawUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';

  if (rawId && !rawUrl) {
    await ensureImagesSchema(db);
    const map = await resolveImageIdsToUrls(db, [rawId], request, env);
    const resolved = map.get(rawId) || '';
    return {
      imageId: rawId,
      imageUrl: resolved ? normalizeImageUrl(resolved, request, env) : null,
    };
  }

  if (!rawId && rawUrl) {
    await ensureImagesSchema(db);
    const map = await resolveImageUrlsToIds(db, [rawUrl]);
    const resolvedId = map.get(rawUrl) || null;
    return {
      imageId: resolvedId,
      imageUrl: normalizeImageUrl(rawUrl, request, env),
    };
  }

  return {
    imageId: rawId || null,
    imageUrl: rawUrl ? normalizeImageUrl(rawUrl, request, env) : null,
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

const normalizeOptionGroupLabel = (value: unknown): string | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw ? raw : null;
};

const normalizeOptionGroupOptions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  value.forEach((entry) => {
    const trimmed = typeof entry === 'string' ? entry.trim() : '';
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });
  return normalized;
};

const normalizeOptionGroup = (labelInput: unknown, optionsInput: unknown) => {
  const label = normalizeOptionGroupLabel(labelInput);
  const options = normalizeOptionGroupOptions(optionsInput);
  if (!label || options.length === 0) {
    return { label: null, optionsJson: null, options: [] as string[] };
  }
  return { label, optionsJson: JSON.stringify(options), options };
};

const normalizeSortOrder = (value: unknown, fallback: number | null): number | null => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
};

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();

  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureCategorySchema(context.env.DB);
    await seedDefaultCategories(context.env.DB);
    await ensureOtherItemsCategory(context.env.DB);

    if (method === 'GET') {
      return handleGet(context.env.DB, context.request, context.env);
    }
    if (method === 'POST') {
      return handlePost(context.env.DB, context.request, context.env);
    }
    if (method === 'PUT') {
      return handlePut(context.env.DB, context.request, context.env);
    }
    if (method === 'DELETE') {
      return handleDelete(context.env.DB, context.request);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin categories error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function handleGet(
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT id, name, subtitle, slug, image_url, hero_image_url, image_id, hero_image_id, sort_order, option_group_label, option_group_options_json, show_on_homepage, shipping_cents, created_at
       FROM categories
       ORDER BY sort_order ASC, datetime(created_at) ASC, name ASC`
    )
    .all<CategoryRow>();
  const categories = (results || [])
    .map((row) => mapRowToCategory(row, request, env))
    .filter((c): c is Category => Boolean(c));
  return json({ categories });
}

async function handlePost(
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<Category> | null;
  const name = (body?.name || '').trim();
  if (!name) return json({ error: 'name is required' }, 400);

  const slug = toSlug(body?.slug || name);
  const id = crypto.randomUUID();
  const showOnHomePage = !!body?.showOnHomePage;
  const subtitle = (body?.subtitle || '').trim() || null;
  const resolvedImage = await resolveCategoryImageInput(db, request, env, {
    imageId: body?.imageId,
    imageUrl: body?.imageUrl,
  });
  const resolvedHero = await resolveCategoryImageInput(db, request, env, {
    imageId: body?.heroImageId,
    imageUrl: body?.heroImageUrl,
  });
  const imageUrl = resolvedImage.imageUrl;
  const heroImageUrl = resolvedHero.imageUrl;
  const shippingCents =
    Number.isFinite(body?.shippingCents as number) && (body?.shippingCents as number) >= 0
      ? Number(body?.shippingCents)
      : 0;
  const sortOrder = normalizeSortOrder(body?.sortOrder, 0);
  if (sortOrder === null) {
    return json({ error: 'sort_order_invalid', detail: 'Order must be a non-negative integer.' }, 400);
  }
  const normalizedOptionGroup = normalizeOptionGroup(body?.optionGroupLabel, body?.optionGroupOptions);

  if (isDataUrl(imageUrl) || isDataUrl(heroImageUrl)) {
    return json({ error: 'image_url_invalid', detail: 'Image URLs must be normal URLs (data URLs are not allowed).' }, 400);
  }

  const result = await db
    .prepare(
      `INSERT INTO categories (id, name, subtitle, slug, image_url, hero_image_url, image_id, hero_image_id, sort_order, option_group_label, option_group_options_json, show_on_homepage, shipping_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
    )
    .bind(
      id,
      name,
      subtitle,
      slug,
      imageUrl,
      heroImageUrl,
      resolvedImage.imageId,
      resolvedHero.imageId,
      sortOrder,
      normalizedOptionGroup.label,
      normalizedOptionGroup.optionsJson,
      showOnHomePage ? 1 : 0,
      shippingCents
    )
    .run();

  if (!result.success) return json({ error: 'Failed to create category' }, 500);

  const created = await db
    .prepare(
      `SELECT id, name, subtitle, slug, image_url, hero_image_url, image_id, hero_image_id, sort_order, option_group_label, option_group_options_json, show_on_homepage, shipping_cents
       FROM categories WHERE id = ?;`
    )
    .bind(id)
    .first<CategoryRow>();

  return json({ category: mapRowToCategory(created as CategoryRow, request, env) }, 201);
}

async function handlePut(
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const body = (await request.json().catch(() => null)) as Partial<Category> | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const sets: string[] = [];
  const values: unknown[] = [];

  const addSet = (clause: string, value: unknown) => {
    sets.push(clause);
    values.push(value);
  };

  if (body.name !== undefined) addSet('name = ?', (body.name || '').trim());
  if (body.subtitle !== undefined) addSet('subtitle = ?', (body.subtitle || '').trim() || null);
  if (body.slug !== undefined || body.name !== undefined) {
    const slugSource = body.slug || body.name;
    if (slugSource !== undefined) addSet('slug = ?', toSlug(slugSource));
  }
  if (body.imageUrl !== undefined) {
    if (isDataUrl(body.imageUrl)) {
      return json({ error: 'image_url_invalid', detail: 'Image URLs must be normal URLs (data URLs are not allowed).' }, 400);
    }
    const resolved = await resolveCategoryImageInput(db, request, env, {
      imageId: body.imageId,
      imageUrl: body.imageUrl,
    });
    addSet('image_url = ?', resolved.imageUrl);
    addSet('image_id = ?', resolved.imageId);
  }
  if (body.heroImageUrl !== undefined) {
    if (isDataUrl(body.heroImageUrl)) {
      return json({ error: 'hero_image_url_invalid', detail: 'Image URLs must be normal URLs (data URLs are not allowed).' }, 400);
    }
    const resolved = await resolveCategoryImageInput(db, request, env, {
      imageId: body.heroImageId,
      imageUrl: body.heroImageUrl,
    });
    addSet('hero_image_url = ?', resolved.imageUrl);
    addSet('hero_image_id = ?', resolved.imageId);
  }
  if (body.imageId !== undefined && body.imageUrl === undefined) {
    const resolved = await resolveCategoryImageInput(db, request, env, {
      imageId: body.imageId,
      imageUrl: body.imageUrl,
    });
    addSet('image_url = ?', resolved.imageUrl);
    addSet('image_id = ?', resolved.imageId);
  }
  if (body.heroImageId !== undefined && body.heroImageUrl === undefined) {
    const resolved = await resolveCategoryImageInput(db, request, env, {
      imageId: body.heroImageId,
      imageUrl: body.heroImageUrl,
    });
    addSet('hero_image_url = ?', resolved.imageUrl);
    addSet('hero_image_id = ?', resolved.imageId);
  }
  if (body.showOnHomePage !== undefined) addSet('show_on_homepage = ?', body.showOnHomePage ? 1 : 0);
  if (body.shippingCents !== undefined) {
    const shippingCents =
      Number.isFinite(body.shippingCents as number) && (body.shippingCents as number) >= 0
        ? Number(body.shippingCents)
        : 0;
    addSet('shipping_cents = ?', shippingCents);
  }
  if (body.sortOrder !== undefined) {
    const normalizedSortOrder = normalizeSortOrder(body.sortOrder, 0);
    if (normalizedSortOrder === null) {
      return json({ error: 'sort_order_invalid', detail: 'Order must be a non-negative integer.' }, 400);
    }
    addSet('sort_order = ?', normalizedSortOrder);
  }
  if (body.optionGroupLabel !== undefined || body.optionGroupOptions !== undefined) {
    let existingLabel: string | null = null;
    let existingOptions: string[] = [];
    if (body.optionGroupLabel === undefined || body.optionGroupOptions === undefined) {
      const existing = await db
        .prepare(`SELECT option_group_label, option_group_options_json FROM categories WHERE id = ?;`)
        .bind(id)
        .first<CategoryRow>();
      existingLabel = existing?.option_group_label ?? null;
      existingOptions = parseOptionGroupOptions(existing?.option_group_options_json ?? null);
    }
    const normalized = normalizeOptionGroup(
      body.optionGroupLabel !== undefined ? body.optionGroupLabel : existingLabel,
      body.optionGroupOptions !== undefined ? body.optionGroupOptions : existingOptions
    );
    addSet('option_group_label = ?', normalized.label);
    addSet('option_group_options_json = ?', normalized.optionsJson);
  }

  if (!sets.length) return json({ error: 'No fields to update' }, 400);

  const result = await db
    .prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?;`)
    .bind(...values, id)
    .run();

  if (!result.success) return json({ error: 'Failed to update category' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Category not found' }, 404);

  const updated = await db
    .prepare(
      `SELECT id, name, subtitle, slug, image_url, hero_image_url, image_id, hero_image_id, sort_order, option_group_label, option_group_options_json, show_on_homepage, shipping_cents
       FROM categories WHERE id = ?;`
    )
    .bind(id)
    .first<CategoryRow>();

  return json({ category: mapRowToCategory(updated as CategoryRow, request, env) });
}

async function handleDelete(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const existing = await db
    .prepare(`SELECT id, name, slug FROM categories WHERE id = ?;`)
    .bind(id)
    .first<{ id: string; name: string | null; slug: string | null }>();

  if (!existing) return json({ error: 'Category not found' }, 404);

  const normalized = toSlug(existing.slug || existing.name);
  if (normalized === OTHER_ITEMS_CATEGORY.slug) {
    return json({ error: 'Cannot delete Other Items category' }, 400);
  }

  await ensureOtherItemsCategory(db);

  const normalizedTarget = toSlug(existing.slug || existing.name);
  try {
    const { results } = await db
      .prepare(`SELECT id, category FROM products WHERE category IS NOT NULL;`)
      .all<{ id: string; category: string | null }>();

    const toUpdate =
      results?.filter((row) => row?.id && toSlug(row.category) === normalizedTarget).map((row) => row.id) || [];

    if (toUpdate.length) {
      const placeholders = toUpdate.map(() => '?').join(', ');
      await db
        .prepare(`UPDATE products SET category = ? WHERE id IN (${placeholders});`)
        .bind(OTHER_ITEMS_CATEGORY.slug, ...toUpdate)
        .run();
    }
  } catch (error) {
    console.error('Failed to reassign products to Other Items', error);
    return json({ error: 'Failed to reassign products to Other Items' }, 500);
  }

  const result = await db.prepare(`DELETE FROM categories WHERE id = ?;`).bind(id).run();
  if (!result.success) return json({ error: 'Failed to delete category' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Category not found' }, 404);

  return json({ success: true });
}

const mapRowToCategory = (
  row: CategoryRow,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Category | null => {
  if (!row || !row.id || !row.name || !row.slug) return null;
  const options = parseOptionGroupOptions(row.option_group_options_json);
  const optionGroupLabel = (row.option_group_label || '').trim() || null;
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
    optionGroupLabel,
    optionGroupOptions: optionGroupLabel && options.length ? options : undefined,
  };
};

const toSlug = (value: string | undefined | null) =>
  (value || '')
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
    const heroImageUrl = tile.imageUrl || null;
    await db
      .prepare(
        `INSERT OR IGNORE INTO categories (id, name, slug, image_url, hero_image_url, show_on_homepage) VALUES (?, ?, ?, ?, ?, ?);`
      )
      .bind(id, name, slug, imageUrl, heroImageUrl, 1)
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
  await ensureOtherItemsCategory(db);
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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
        await db
          .prepare(`UPDATE products SET category = ? WHERE LOWER(TRIM(category)) = ?;`)
          .bind(OTHER_ITEMS_CATEGORY.slug, 'uncategorized')
          .run();
      }
      return existing.id;
    }

    const id = OTHER_ITEMS_CATEGORY.id || crypto.randomUUID();
    const name = OTHER_ITEMS_CATEGORY.name;
    const slug = OTHER_ITEMS_CATEGORY.slug;
    await db
      .prepare(`INSERT INTO categories (id, name, slug, show_on_homepage) VALUES (?, ?, ?, 1);`)
      .bind(id, name, slug)
      .run();
    return id;
  } catch (error) {
    console.error('Failed to ensure Other Items category', error);
    return null;
  }
}

