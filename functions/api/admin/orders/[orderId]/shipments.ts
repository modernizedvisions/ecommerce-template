import { requireAdmin } from '../../../_lib/adminAuth';
import {
  ensureShippingLabelsSchema,
  getNextParcelIndex,
  jsonResponse,
  listOrderShipments,
  orderExists,
  type D1PreparedStatement,
  type ShippingLabelsEnv,
} from '../../../_lib/shippingLabels';

type BoxPresetRow = {
  id: string;
  length_in: number;
  width_in: number;
  height_in: number;
  default_weight_lb: number | null;
};

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toFiniteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getOrderId = (request: Request): string | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/orders\/([^/]+)\/shipments$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const fetchPreset = async (stmtFactory: (query: string) => D1PreparedStatement, id: string): Promise<BoxPresetRow | null> =>
  stmtFactory(
    `SELECT id, length_in, width_in, height_in, default_weight_lb
     FROM shipping_box_presets
     WHERE id = ?
     LIMIT 1;`
  )
    .bind(id)
    .first<BoxPresetRow>();

export async function onRequestGet(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const orderId = getOrderId(context.request);
  if (!orderId) return jsonResponse({ ok: false, error: 'Missing orderId' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found' }, 404);
    }
    const shipments = await listOrderShipments(context.env.DB, orderId);
    const actualLabelTotalCents = shipments.reduce((sum, shipment) => sum + (shipment.labelCostAmountCents || 0), 0);
    return jsonResponse({
      ok: true,
      shipments,
      summary: {
        actualLabelTotalCents,
      },
    });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments] failed to fetch shipments', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to fetch shipments', detail }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const orderId = getOrderId(context.request);
  if (!orderId) return jsonResponse({ ok: false, error: 'Missing orderId' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found' }, 404);
    }

    const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
    const boxPresetId = trimOrNull(body?.boxPresetId);
    const customLengthIn = toFiniteOrNull(body?.customLengthIn);
    const customWidthIn = toFiniteOrNull(body?.customWidthIn);
    const customHeightIn = toFiniteOrNull(body?.customHeightIn);
    const hasAnyCustomDim = customLengthIn !== null || customWidthIn !== null || customHeightIn !== null;
    const hasAllCustomDims = customLengthIn !== null && customWidthIn !== null && customHeightIn !== null;

    if (hasAnyCustomDim && !hasAllCustomDims) {
      return jsonResponse({ ok: false, error: 'Provide all three custom dimensions (length/width/height).' }, 400);
    }

    let preset: BoxPresetRow | null = null;
    if (boxPresetId) {
      preset = await fetchPreset(context.env.DB.prepare.bind(context.env.DB), boxPresetId);
      if (!preset) {
        return jsonResponse({ ok: false, error: 'Selected box preset not found' }, 404);
      }
    }

    if (!hasAllCustomDims && !preset) {
      return jsonResponse({ ok: false, error: 'Select a box preset or enter custom dimensions.' }, 400);
    }

    const weightCandidate = toFiniteOrNull(body?.weightLb);
    const weightLb = weightCandidate ?? (preset?.default_weight_lb ?? null);
    if (weightLb === null || !Number.isFinite(weightLb) || weightLb <= 0) {
      return jsonResponse({ ok: false, error: 'weightLb must be a positive number.' }, 400);
    }

    const parcelIndex = await getNextParcelIndex(context.env.DB, orderId);
    const timestamp = new Date().toISOString();
    const shipmentId = crypto.randomUUID();

    await context.env.DB
      .prepare(
        `INSERT INTO order_shipments (
           id,
           order_id,
           parcel_index,
           box_preset_id,
           custom_length_in,
           custom_width_in,
           custom_height_in,
           weight_lb,
           label_state,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);`
      )
      .bind(
        shipmentId,
        orderId,
        parcelIndex,
        boxPresetId,
        hasAllCustomDims ? Number(customLengthIn!.toFixed(3)) : null,
        hasAllCustomDims ? Number(customWidthIn!.toFixed(3)) : null,
        hasAllCustomDims ? Number(customHeightIn!.toFixed(3)) : null,
        Number(weightLb.toFixed(3)),
        timestamp,
        timestamp
      )
      .run();

    const shipments = await listOrderShipments(context.env.DB, orderId);
    const shipment = shipments.find((entry) => entry.id === shipmentId) || null;
    return jsonResponse({ ok: true, shipment, shipments });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments] failed to create shipment', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to create shipment', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}

