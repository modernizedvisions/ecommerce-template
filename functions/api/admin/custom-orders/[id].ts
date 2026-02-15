import { extractStorageKey } from '../../lib/images';
import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CustomOrderPayload = {
  customerName?: string;
  customerEmail?: string;
  description?: string;
  imageUrl?: string | null;
  imageId?: string | null;
  imageStorageKey?: string | null;
  amount?: number | null;
  shippingCents?: number | null;
  showOnSoldProducts?: boolean;
  messageId?: string | null;
  status?: 'pending' | 'paid';
  paymentLink?: string | null;
};

export async function onRequestPatch(context: { env: { DB: D1Database }; request: Request; params: Record<string, string> }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    await ensureCustomOrdersSchema(context.env.DB);
    const columns = await getCustomOrdersColumns(context.env.DB);
    const emailCol = columns.emailCol;
    const debug = (context as any)?.env?.DEBUG_CUSTOM_ORDERS === '1';
    console.log('[custom-orders/:id] ensured schema (patch)', { columns: columns.allColumns, emailCol });
    const id = context.params?.id;
    if (!id) return jsonResponse({ error: 'Missing id' }, 400);

    const body = (await context.request.json().catch(() => null)) as Partial<CustomOrderPayload> | null;
    if (!body) return jsonResponse({ error: 'Invalid body' }, 400);
    if (isBlockedImageUrl(body.imageUrl)) {
      return jsonResponse({ error: 'imageUrl must be uploaded first (no blob/data URLs).' }, 400);
    }

    const existing = await context.env.DB
      .prepare(`SELECT id, image_url, image_id, image_storage_key FROM custom_orders WHERE id = ?`)
      .bind(id)
      .first<{ id: string; image_url: string | null; image_id: string | null; image_storage_key: string | null }>();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);
    const existingImageUrl = existing.image_url ?? null;
    const existingImageId = existing.image_id ?? null;
    const existingImageStorageKey = existing.image_storage_key ?? null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.customerName !== undefined) {
      fields.push('customer_name = ?');
      values.push(body.customerName.trim());
    }
    if (body.customerEmail !== undefined) {
      if (emailCol) {
        fields.push(`${emailCol} = ?`);
        values.push(body.customerEmail.trim());
      } else {
        console.warn('[custom-orders/:id] no email column found; skipping email update');
      }
    }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description.trim());
    }
    const normalizedImageUrl =
      body.imageUrl !== undefined ? (body.imageUrl ? body.imageUrl.trim() : null) : undefined;
    const normalizedImageId =
      body.imageId !== undefined ? (body.imageId ? body.imageId.trim() : null) : undefined;
    const normalizedImageStorageKey =
      body.imageStorageKey !== undefined ? (body.imageStorageKey ? body.imageStorageKey.trim() : null) : undefined;
    const derivedStorageKey =
      normalizedImageStorageKey !== undefined
        ? normalizedImageStorageKey
        : extractStorageKey(normalizedImageUrl);
    if (body.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(normalizedImageUrl);
    }
    const shouldClearImageRefs = body.imageUrl !== undefined && !normalizedImageUrl;
    if (shouldClearImageRefs && body.imageId === undefined) {
      fields.push('image_id = ?');
      values.push(null);
    }
    if (shouldClearImageRefs && body.imageStorageKey === undefined) {
      fields.push('image_storage_key = ?');
      values.push(null);
    }
    if (body.imageId !== undefined) {
      fields.push('image_id = ?');
      values.push(normalizedImageId);
    }
    if (body.imageStorageKey !== undefined || body.imageUrl !== undefined) {
      fields.push('image_storage_key = ?');
      values.push(derivedStorageKey);
    }
    const nextImageUrl = normalizedImageUrl !== undefined ? normalizedImageUrl : existingImageUrl;
    const nextImageId = normalizedImageId !== undefined ? normalizedImageId : existingImageId;
    const nextImageStorageKey =
      derivedStorageKey !== undefined ? derivedStorageKey : existingImageStorageKey;
    const hasImage = !!(nextImageUrl && nextImageUrl.trim()) || !!nextImageId || !!nextImageStorageKey;
    if (body.showOnSoldProducts !== undefined || (body.imageUrl !== undefined && !hasImage)) {
      const showOnSoldProducts = hasImage && body.showOnSoldProducts === true ? 1 : 0;
      fields.push('show_on_sold_products = ?');
      values.push(showOnSoldProducts);
    }
    if (body.amount !== undefined) {
      fields.push('amount = ?');
      values.push(body.amount);
    }
    if (body.shippingCents !== undefined) {
      const shippingCents = normalizeShippingCents(body.shippingCents);
      if (shippingCents === null) {
        return jsonResponse({ error: 'shippingCents must be a non-negative integer.' }, 400);
      }
      fields.push('shipping_cents = ?');
      values.push(shippingCents);
      if (debug) {
        console.log('[custom-orders/:id] patch shipping', {
          id,
          shippingRaw: body.shippingCents,
          shippingCents,
        });
      }
    }
    if (body.messageId !== undefined) {
      fields.push('message_id = ?');
      values.push(body.messageId);
    }
    if (body.status !== undefined) {
      fields.push('status = ?');
      values.push(body.status === 'paid' ? 'paid' : 'pending');
    }
    if (body.paymentLink !== undefined) {
      fields.push('payment_link = ?');
      values.push(body.paymentLink);
    }

    if (!fields.length) return jsonResponse({ error: 'No fields to update' }, 400);

    const stmt = context.env.DB.prepare(
      `UPDATE custom_orders SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id);

    const result = await stmt.run();
    if (!result.success) {
      console.error('Failed to update custom order', result.error);
      return jsonResponse({ error: 'Failed to update custom order', detail: result.error || 'unknown error' }, 500);
    }

    // TODO: Add Stripe reconciliation when payments are wired.
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Failed to update custom order', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to update custom order', detail: message }, 500);
  }
}

async function ensureCustomOrdersSchema(_db: D1Database) {
  return;
}

async function getCustomOrdersColumns(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const allColumns = (results || []).map((c) => c.name);
  const emailCol = allColumns.includes('customer_email')
    ? 'customer_email'
    : allColumns.includes('customer_email1')
    ? 'customer_email1'
    : null;
  return { allColumns, emailCol };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}

function isBlockedImageUrl(value?: string | null) {
  if (!value) return false;
  return value.startsWith('data:') || value.startsWith('blob:');
}

function normalizeShippingCents(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}



