import { requireAdmin } from '../../../../_lib/adminAuth';
import {
  ensureShippingLabelsSchema,
  getOrderShipment,
  jsonResponse,
  listOrderShipments,
  orderExists,
  type ShippingLabelsEnv,
} from '../../../../_lib/shippingLabels';

type BoxPresetRow = {
  id: string;
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

const getRouteParams = (request: Request): { orderId: string; shipmentId: string } | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/orders\/([^/]+)\/shipments\/([^/]+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    orderId: decodeURIComponent(match[1]),
    shipmentId: decodeURIComponent(match[2]),
  };
};

const fetchPreset = async (env: ShippingLabelsEnv, id: string): Promise<BoxPresetRow | null> =>
  env.DB.prepare(`SELECT id, default_weight_lb FROM shipping_box_presets WHERE id = ? LIMIT 1;`)
    .bind(id)
    .first<BoxPresetRow>();

export async function onRequestPut(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const params = getRouteParams(context.request);
  if (!params) return jsonResponse({ ok: false, error: 'Missing orderId or shipmentId' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, params.orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found' }, 404);
    }
    const existing = await getOrderShipment(context.env.DB, params.orderId, params.shipmentId);
    if (!existing) {
      return jsonResponse({ ok: false, error: 'Shipment not found' }, 404);
    }
    if (existing.purchasedAt || existing.labelState === 'generated') {
      return jsonResponse({ ok: false, code: 'SHIPMENT_ALREADY_PURCHASED', error: 'Purchased shipments cannot be edited.' }, 409);
    }

    const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);

    const boxPresetId = trimOrNull(body.boxPresetId);
    const customLengthIn = toFiniteOrNull(body.customLengthIn);
    const customWidthIn = toFiniteOrNull(body.customWidthIn);
    const customHeightIn = toFiniteOrNull(body.customHeightIn);
    const hasAnyCustomDim = customLengthIn !== null || customWidthIn !== null || customHeightIn !== null;
    const hasAllCustomDims = customLengthIn !== null && customWidthIn !== null && customHeightIn !== null;
    if (hasAnyCustomDim && !hasAllCustomDims) {
      return jsonResponse({ ok: false, error: 'Provide all three custom dimensions (length/width/height).' }, 400);
    }

    let preset: BoxPresetRow | null = null;
    if (boxPresetId) {
      preset = await fetchPreset(context.env, boxPresetId);
      if (!preset) {
        return jsonResponse({ ok: false, error: 'Selected box preset not found' }, 404);
      }
    }
    if (!hasAllCustomDims && !boxPresetId) {
      return jsonResponse({ ok: false, error: 'Select a box preset or enter custom dimensions.' }, 400);
    }

    const weightCandidate = toFiniteOrNull(body.weightLb);
    const weightLb = weightCandidate ?? (preset?.default_weight_lb ?? existing.weightLb);
    if (!Number.isFinite(weightLb) || weightLb <= 0) {
      return jsonResponse({ ok: false, error: 'weightLb must be a positive number.' }, 400);
    }

    await context.env.DB.prepare(
      `UPDATE order_shipments
       SET box_preset_id = ?,
           custom_length_in = ?,
           custom_width_in = ?,
           custom_height_in = ?,
           weight_lb = ?,
           quote_selected_id = NULL,
           error_message = NULL,
           updated_at = ?
       WHERE id = ? AND order_id = ?;`
    )
      .bind(
        boxPresetId,
        hasAllCustomDims ? Number(customLengthIn!.toFixed(3)) : null,
        hasAllCustomDims ? Number(customWidthIn!.toFixed(3)) : null,
        hasAllCustomDims ? Number(customHeightIn!.toFixed(3)) : null,
        Number(weightLb.toFixed(3)),
        new Date().toISOString(),
        params.shipmentId,
        params.orderId
      )
      .run();

    const shipments = await listOrderShipments(context.env.DB, params.orderId);
    const shipment = shipments.find((entry) => entry.id === params.shipmentId) || null;
    return jsonResponse({ ok: true, shipment, shipments });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments/:shipmentId] failed to update shipment', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to update shipment', detail }, 500);
  }
}

export async function onRequestDelete(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const params = getRouteParams(context.request);
  if (!params) return jsonResponse({ ok: false, error: 'Missing orderId or shipmentId' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, params.orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found' }, 404);
    }
    const existing = await getOrderShipment(context.env.DB, params.orderId, params.shipmentId);
    if (!existing) {
      return jsonResponse({ ok: false, error: 'Shipment not found' }, 404);
    }
    if (existing.purchasedAt || existing.labelState === 'generated') {
      return jsonResponse(
        { ok: false, code: 'SHIPMENT_ALREADY_PURCHASED', error: 'Purchased shipments cannot be removed.' },
        409
      );
    }

    await context.env.DB
      .prepare(`DELETE FROM order_shipments WHERE id = ? AND order_id = ?;`)
      .bind(params.shipmentId, params.orderId)
      .run();

    const remaining = await context.env.DB
      .prepare(`SELECT id FROM order_shipments WHERE order_id = ? ORDER BY parcel_index ASC, datetime(created_at) ASC;`)
      .bind(params.orderId)
      .all<{ id: string }>();
    const ids = (remaining.results || []).map((row) => row.id);
    for (let i = 0; i < ids.length; i += 1) {
      await context.env.DB
        .prepare(`UPDATE order_shipments SET parcel_index = ?, updated_at = ? WHERE id = ? AND order_id = ?;`)
        .bind(i + 1, new Date().toISOString(), ids[i], params.orderId)
        .run();
    }

    const shipments = await listOrderShipments(context.env.DB, params.orderId);
    return jsonResponse({ ok: true, shipments });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments/:shipmentId] failed to delete shipment', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to delete shipment', detail }, 500);
  }
}

export async function onRequest(context: { request: Request; env: ShippingLabelsEnv }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'PUT') return onRequestPut(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
