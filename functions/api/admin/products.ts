import type { Product } from '../../../src/lib/types';
import {
  ensureImagesSchema,
  ensureProductImageColumns,
  normalizeImageUrl,
  resolveImageIdsToUrls,
  resolveImageUrlsToIds,
} from '../lib/images';
import { requireAdmin } from '../_lib/adminAuth';
import { createStripePrice, createStripeProduct } from '../../_lib/stripeClient';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ProductRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  description: string | null;
  price_cents: number | null;
  category: string | null;
  image_url: string | null;
  image_urls_json?: string | null;
  primary_image_id?: string | null;
  image_ids_json?: string | null;
  is_active: number | null;
  is_one_off?: number | null;
  is_sold?: number | null;
  quantity_available?: number | null;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  collection?: string | null;
  created_at: string | null;
};

type NewProductInput = {
  name: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl?: string;
  imageUrls?: string[];
  primaryImageId?: string;
  imageIds?: string[];
  quantityAvailable?: number;
  isOneOff?: boolean;
  isActive?: boolean;
  stripePriceId?: string;
  stripeProductId?: string;
  collection?: string;
};

const mapRowToProduct = (row: ProductRow, request: Request, env: { PUBLIC_IMAGES_BASE_URL?: string }): Product => {
  const rawImageUrls = row.image_urls_json ? safeParseJsonArray(row.image_urls_json) : [];
  const rawPrimary = row.image_url || rawImageUrls[0] || '';
  const primaryImage = normalizeImageUrl(rawPrimary, request, env);
  const imageUrls = rawImageUrls
    .map((url) => normalizeImageUrl(url, request, env))
    .filter(Boolean)
    .filter((url) => url !== primaryImage);
  const imageIds = row.image_ids_json ? safeParseJsonArray(row.image_ids_json) : [];

  return {
    id: row.id,
    stripeProductId: row.stripe_product_id || row.id,
    stripePriceId: row.stripe_price_id || undefined,
    name: row.name ?? '',
    description: row.description ?? '',
    imageUrls: primaryImage ? [primaryImage, ...imageUrls] : imageUrls,
    imageUrl: primaryImage || imageUrls[0] || '',
    thumbnailUrl: primaryImage || undefined,
    primaryImageId: row.primary_image_id || undefined,
    imageIds,
    type: row.category ?? 'General',
    category: row.category ?? undefined,
    categories: row.category ? [row.category] : undefined,
    collection: row.collection ?? undefined,
    oneoff: row.is_one_off === null ? true : row.is_one_off === 1,
    visible: row.is_active === null ? true : row.is_active === 1,
    isSold: row.is_sold === 1,
    priceCents: row.price_cents ?? undefined,
    soldAt: undefined,
    quantityAvailable: row.quantity_available ?? undefined,
    slug: row.slug ?? undefined,
  };
};

const safeParseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
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

const sanitizeCategory = (value: string | undefined | null) => (value || '').trim();

const validateNewProduct = (input: Partial<NewProductInput>) => {
  if (!input.name || !input.description || input.priceCents === undefined || input.priceCents === null) {
    return 'name, description, and priceCents are required';
  }
  if (input.priceCents < 0) {
    return 'priceCents must be non-negative';
  }
  if (!sanitizeCategory(input.category)) {
    return 'category is required';
  }
  const hasImageIds = Array.isArray(input.imageIds) && input.imageIds.length > 0;
  if (!input.imageUrl && !input.primaryImageId && !hasImageIds) {
    return 'imageUrl, primaryImageId, or imageIds are required';
  }
  return null;
};

const REQUIRED_PRODUCT_COLUMNS: Record<string, string> = {
  image_urls_json: 'image_urls_json TEXT',
  primary_image_id: 'primary_image_id TEXT',
  image_ids_json: 'image_ids_json TEXT',
  is_one_off: 'is_one_off INTEGER DEFAULT 1',
  is_sold: 'is_sold INTEGER DEFAULT 0',
  quantity_available: 'quantity_available INTEGER DEFAULT 1',
  stripe_price_id: 'stripe_price_id TEXT',
  stripe_product_id: 'stripe_product_id TEXT',
  collection: 'collection TEXT',
};

const createProductsTable = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT,
    description TEXT,
    price_cents INTEGER,
    category TEXT,
    image_url TEXT,
    image_urls_json TEXT,
    primary_image_id TEXT,
    image_ids_json TEXT,
    is_active INTEGER DEFAULT 1,
    is_one_off INTEGER DEFAULT 1,
    is_sold INTEGER DEFAULT 0,
    quantity_available INTEGER DEFAULT 1,
    stripe_price_id TEXT,
    stripe_product_id TEXT,
    collection TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

async function ensureProductSchema(db: D1Database) {
  await db.prepare(createProductsTable).run();

  for (const [name, ddl] of Object.entries(REQUIRED_PRODUCT_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE products ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error(`Failed to add column ${name}`, error);
      }
    }
  }
}

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

const resolveProductImagePayload = async (
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string },
  input: {
    imageUrl?: string;
    imageUrls?: string[];
    primaryImageId?: string;
    imageIds?: string[];
  }
): Promise<{
  imageUrl: string;
  imageUrls: string[];
  primaryImageId?: string;
  imageIds: string[];
}> => {
  const rawPrimaryId = typeof input.primaryImageId === 'string' ? input.primaryImageId.trim() : '';
  const rawImageIds = normalizeStringArray(input.imageIds);
  const rawPrimaryUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  const rawImageUrls = normalizeStringArray(input.imageUrls);

  if (rawPrimaryId || rawImageIds.length) {
    await ensureImagesSchema(db);
    const ids = [rawPrimaryId, ...rawImageIds].filter(Boolean);
    const map = await resolveImageIdsToUrls(db, ids, request, env);
    const primaryFromId = rawPrimaryId ? map.get(rawPrimaryId) || '' : '';
    const restFromIds = rawImageIds.map((id) => map.get(id)).filter(Boolean) as string[];
    const primaryUrl = normalizeImageUrl(primaryFromId || rawPrimaryUrl, request, env);
    const restUrls = restFromIds.length
      ? restFromIds
      : rawImageUrls.map((url) => normalizeImageUrl(url, request, env)).filter(Boolean);

    return {
      imageUrl: primaryUrl || restUrls[0] || '',
      imageUrls: restUrls.filter((url) => url && url !== primaryUrl),
      primaryImageId: rawPrimaryId || undefined,
      imageIds: rawImageIds.filter((id) => id && id !== rawPrimaryId),
    };
  }

  const normalizedPrimary = normalizeImageUrl(rawPrimaryUrl, request, env);
  const normalizedRest = rawImageUrls.map((url) => normalizeImageUrl(url, request, env)).filter(Boolean);

  let primaryImageId: string | undefined;
  let imageIds: string[] = [];
  if (normalizedPrimary || normalizedRest.length) {
    await ensureImagesSchema(db);
    const map = await resolveImageUrlsToIds(db, [normalizedPrimary, ...normalizedRest].filter(Boolean));
    primaryImageId = normalizedPrimary ? map.get(normalizedPrimary) : undefined;
    imageIds = normalizedRest.map((url) => map.get(url)).filter(Boolean) as string[];
  }

  return {
    imageUrl: normalizedPrimary || normalizedRest[0] || '',
    imageUrls: normalizedRest.filter((url) => url && url !== normalizedPrimary),
    primaryImageId,
    imageIds,
  };
};

export async function onRequestGet(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureProductSchema(context.env.DB);
    await ensureProductImageColumns(context.env.DB);

    const statement = context.env.DB.prepare(`
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
             primary_image_id, image_ids_json,
             is_active, is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id,
             collection, created_at
      FROM products
      ORDER BY created_at DESC;
    `);

    const { results } = await statement.all<ProductRow>();
    const products: Product[] = (results || []).map((row) => mapRowToProduct(row, context.request, context.env));

    return new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in GET /api/admin/products', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost(context: { env: { DB: D1Database; STRIPE_SECRET_KEY?: string }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    console.log('[products save] incoming', {
      method: context.request.method,
      url: context.request.url,
      contentType: context.request.headers.get('content-type'),
      contentLength: context.request.headers.get('content-length'),
    });

    let body: Partial<NewProductInput>;
    try {
      body = (await context.request.json()) as Partial<NewProductInput>;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: 'Invalid JSON', detail }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
    console.log('[products save] payload summary', {
      keys: Object.keys(body),
      imageCount: imageUrls.length + (body.imageUrl ? 1 : 0),
      imageUrlPrefix: body.imageUrl ? body.imageUrl.slice(0, 30) : null,
      imageUrlsPreview: imageUrls.slice(0, 3).map((url) => (typeof url === 'string' ? url.slice(0, 30) : '')),
    });

    const error = validateNewProduct(body);
    if (error) {
      return new Response(JSON.stringify({ error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const id = crypto.randomUUID();
    const slug = toSlug(body.name!);
    const isOneOff = body.isOneOff ?? true;
    const quantityAvailable = isOneOff ? 1 : Math.max(1, body.quantityAvailable ?? 1);
    const isActive = body.isActive ?? true;
    const category = sanitizeCategory(body.category);

    await ensureProductSchema(context.env.DB);
    await ensureProductImageColumns(context.env.DB);
    try {
      const table = await context.env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='products';`
      ).first<{ name: string }>();
      if (!table?.name) {
        return new Response(JSON.stringify({ error: 'Products table missing' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (dbError) {
      const detail = dbError instanceof Error ? dbError.message : String(dbError);
      return new Response(JSON.stringify({ error: 'DB schema check failed', detail }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resolvedImages = await resolveProductImagePayload(context.env.DB, context.request, context.env, {
      imageUrl: body.imageUrl,
      imageUrls: body.imageUrls,
      primaryImageId: body.primaryImageId,
      imageIds: body.imageIds,
    });

    const insertColumns = [
      'id',
      'name',
      'slug',
      'description',
      'price_cents',
      'category',
      'image_url',
      'image_urls_json',
      'primary_image_id',
      'image_ids_json',
      'is_active',
      'is_one_off',
      'is_sold',
      'quantity_available',
      'stripe_price_id',
      'stripe_product_id',
      'collection',
    ];

    const insertValues = [
      id,
      body.name,
      slug,
      body.description,
      body.priceCents,
      category,
      resolvedImages.imageUrl || null,
      resolvedImages.imageUrls.length ? JSON.stringify(resolvedImages.imageUrls) : null,
      resolvedImages.primaryImageId || null,
      resolvedImages.imageIds.length ? JSON.stringify(resolvedImages.imageIds) : null,
      isActive ? 1 : 0,
      isOneOff ? 1 : 0,
      0,
      quantityAvailable,
      body.stripePriceId || null,
      body.stripeProductId || null,
      body.collection || null,
    ];

    if ((context.env as { DEBUG_PRODUCTS?: string }).DEBUG_PRODUCTS === '1') {
      console.log('[admin products] insert', {
        columnsCount: insertColumns.length,
        valuesCount: insertValues.length,
        columns: insertColumns,
      });
    }

    const statement = context.env.DB.prepare(
      `
      INSERT INTO products (
        ${insertColumns.join(', ')}
      ) VALUES (${insertColumns.map(() => '?').join(', ')});
    `
    ).bind(...insertValues);

    // TODO: When Stripe is wired, create/update Stripe product + price and persist IDs here.
    const result = await statement.run();
    if (!result.success) {
      throw new Error(result.error || 'Insert failed');
    }

    const fetchRow = async () =>
      context.env.DB.prepare(
        `
        SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
               primary_image_id, image_ids_json,
               is_active, is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id,
               collection, created_at
        FROM products WHERE id = ?;
      `
    )
        .bind(id)
        .first<ProductRow>();

    let inserted = await fetchRow();

    const stripeSecret = context.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      const product = inserted ? mapRowToProduct(inserted, context.request, context.env) : null;
      return new Response(JSON.stringify({ product, error: 'Stripe is not configured' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      // Only create Stripe resources if missing.
      if (!inserted?.stripe_product_id || !inserted?.stripe_price_id) {
        const stripeProduct = await createStripeProduct(stripeSecret, {
          name: body.name || 'Chesapeake Shell Item',
          description: body.description || undefined,
          metadata: {
            d1_product_id: id,
            d1_product_slug: slug,
          },
        });

        const stripePrice = await createStripePrice(stripeSecret, {
          product: stripeProduct.id,
          unit_amount: body.priceCents,
          currency: 'usd',
        });

        await context.env.DB.prepare(
          `UPDATE products SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?;`
        )
          .bind(stripeProduct.id, stripePrice.id, id)
          .run();

        inserted = await fetchRow();
      }
    } catch (stripeError) {
      console.error('Failed to create Stripe product/price', stripeError);
      const product = inserted ? mapRowToProduct(inserted, context.request, context.env) : null;
      return new Response(JSON.stringify({ product, error: 'Failed to create Stripe product and price.' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const product = inserted ? mapRowToProduct(inserted, context.request, context.env) : null;

    return new Response(JSON.stringify({ product }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Error in POST /api/admin/products', { detail });
    return new Response(JSON.stringify({ error: 'Internal server error', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function onRequestDelete(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    const url = new URL(context.request.url);
    let id = url.searchParams.get('id');

    if (!id) {
      try {
        const body = (await context.request.json().catch(() => null)) as { id?: string } | null;
        if (body?.id) id = body.id;
      } catch {
        // ignore body parse errors
      }
    }

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureProductSchema(context.env.DB);

    const result = await context.env.DB.prepare('DELETE FROM products WHERE id = ?;')
      .bind(id)
      .run();

    if (!result.success) {
      throw new Error(result.error || 'Delete failed');
    }

    if (result.meta?.changes === 0) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to delete product', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

