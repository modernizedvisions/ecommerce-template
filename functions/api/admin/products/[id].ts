import type { Product } from '../../../../src/lib/types';
import {
  ensureImagesSchema,
  ensureProductImageColumns,
  normalizeImageUrl,
  resolveImageIdsToUrls,
  resolveImageUrlsToIds,
} from '../../lib/images';
import { requireAdmin } from '../../_lib/adminAuth';
import { createStripePrice, createStripeProduct } from '../../../_lib/stripeClient';

type D1PreparedStatement = {
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

type UpdateProductInput = {
  name?: string;
  description?: string;
  priceCents?: number;
  category?: string;
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

const validateUpdate = (input: UpdateProductInput) => {
  if (input.priceCents !== undefined && input.priceCents < 0) {
    return 'priceCents must be non-negative';
  }
  if (input.category !== undefined && !sanitizeCategory(input.category)) {
    return 'category cannot be empty';
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

export async function onRequestPut(context: {
  env: { DB: D1Database; STRIPE_SECRET_KEY?: string };
  request: Request;
  params: Record<string, string>;
}): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    console.log('[products save] incoming', {
      method: context.request.method,
      url: context.request.url,
      contentType: context.request.headers.get('content-type'),
      contentLength: context.request.headers.get('content-length'),
    });

    const id = context.params?.id;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Product id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: UpdateProductInput;
    try {
      body = (await context.request.json()) as UpdateProductInput;
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
    const validationError = validateUpdate(body);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hasDataUrl = (value?: string | null) =>
      typeof value === 'string' && value.trim().toLowerCase().startsWith('data:image/');
    const hasDataUrlInArray = (value?: string[] | null) =>
      Array.isArray(value) && value.some((entry) => hasDataUrl(entry));

    if (hasDataUrl(body.imageUrl) || hasDataUrlInArray(body.imageUrls)) {
      return new Response(
        JSON.stringify({ error: 'Images must be uploaded first; only URLs allowed.' }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const sets: string[] = [];
    const values: unknown[] = [];

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

    const addSet = (clause: string, value: unknown) => {
      sets.push(clause);
      values.push(value);
    };

    const existing = await context.env.DB.prepare(
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

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const incomingPriceCents = body.priceCents !== undefined ? Math.round(Number(body.priceCents)) : undefined;
    if (incomingPriceCents !== undefined && !Number.isFinite(incomingPriceCents)) {
      return new Response(JSON.stringify({ error: 'priceCents must be a valid number' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existingPriceCents =
      typeof existing.price_cents === 'number' && Number.isFinite(existing.price_cents)
        ? existing.price_cents
        : null;
    const priceChanged =
      incomingPriceCents !== undefined && existingPriceCents !== incomingPriceCents;

    let stripeProductIdToUse = existing.stripe_product_id || null;
    let newStripePriceId: string | null = null;

    if (priceChanged) {
      const stripeSecret = context.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) {
        return new Response(
          JSON.stringify({ error: 'Stripe is not configured. Pricing changes require Stripe.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      try {
        if (!stripeProductIdToUse) {
          const name = body.name ?? existing.name ?? 'Dover Designs Product';
          const description = body.description ?? existing.description ?? undefined;
          const slug = body.name ? toSlug(body.name) : existing.slug ?? undefined;
          const stripeProduct = await createStripeProduct(stripeSecret, {
            name,
            description,
            metadata: {
              d1_product_id: id,
              d1_product_slug: slug || '',
            },
          });
          stripeProductIdToUse = stripeProduct.id;
        }

        const stripePrice = await createStripePrice(stripeSecret, {
          product: stripeProductIdToUse,
          unit_amount: incomingPriceCents ?? 0,
          currency: 'usd',
          metadata: {
            d1_product_id: id,
          },
        });

        newStripePriceId = stripePrice.id;
        console.log('[admin products] price change', {
          id,
          oldPriceCents: existingPriceCents,
          newPriceCents: incomingPriceCents,
          oldStripePriceId: existing.stripe_price_id || null,
          newStripePriceId,
          stripeProductId: stripeProductIdToUse,
        });
      } catch (stripeError) {
        const detail = stripeError instanceof Error ? stripeError.message : String(stripeError);
        console.error('Failed to update Stripe price', { id, detail });
        return new Response(JSON.stringify({ error: 'Failed to update Stripe price', detail }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (body.name !== undefined) addSet('name = ?', body.name);
    if (body.name) addSet('slug = ?', toSlug(body.name));
    if (body.description !== undefined) addSet('description = ?', body.description);
    if (incomingPriceCents !== undefined) addSet('price_cents = ?', incomingPriceCents);
    if (body.category !== undefined) {
      const categoryValue = sanitizeCategory(body.category);
      addSet('category = ?', categoryValue || null);
    }
    const hasImagePayload =
      body.imageUrl !== undefined ||
      body.imageUrls !== undefined ||
      body.primaryImageId !== undefined ||
      body.imageIds !== undefined;

    if (hasImagePayload) {
      const resolved = await resolveProductImagePayload(context.env.DB, context.request, context.env, {
        imageUrl: body.imageUrl,
        imageUrls: body.imageUrls,
        primaryImageId: body.primaryImageId,
        imageIds: body.imageIds,
      });
      addSet('image_url = ?', resolved.imageUrl ? resolved.imageUrl : null);
      addSet('image_urls_json = ?', resolved.imageUrls.length ? JSON.stringify(resolved.imageUrls) : null);
      addSet('primary_image_id = ?', resolved.primaryImageId || null);
      addSet('image_ids_json = ?', resolved.imageIds.length ? JSON.stringify(resolved.imageIds) : null);
    }
    if (body.quantityAvailable !== undefined) addSet('quantity_available = ?', body.quantityAvailable);
    if (body.isOneOff !== undefined) addSet('is_one_off = ?', body.isOneOff ? 1 : 0);
    if (body.isActive !== undefined) addSet('is_active = ?', body.isActive ? 1 : 0);
    if (newStripePriceId) addSet('stripe_price_id = ?', newStripePriceId);
    if (stripeProductIdToUse && stripeProductIdToUse !== existing.stripe_product_id) {
      addSet('stripe_product_id = ?', stripeProductIdToUse);
    }
    if (!priceChanged) {
      if (body.stripePriceId !== undefined) addSet('stripe_price_id = ?', body.stripePriceId);
      if (body.stripeProductId !== undefined) addSet('stripe_product_id = ?', body.stripeProductId);
    }
    if (body.collection !== undefined) addSet('collection = ?', body.collection);

    if (!sets.length) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const statement = context.env.DB.prepare(
      `UPDATE products SET ${sets.join(', ')} WHERE id = ?;`
    ).bind(...values, id);

    // TODO: When Stripe is wired, sync updates to Stripe product/price as needed.
    const result = await statement.run();
    if (!result.success) {
      throw new Error(result.error || 'Update failed');
    }
    if (result.meta?.changes === 0) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updated = await context.env.DB.prepare(
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

    const product = updated ? mapRowToProduct(updated, context.request, context.env) : null;

    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Failed to update product', { detail, id: context.params?.id });
    return new Response(JSON.stringify({ error: 'Update product failed', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestDelete(context: {
  env: { DB: D1Database };
  request: Request;
  params: Record<string, string>;
}): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    const id = context.params?.id;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Product id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

