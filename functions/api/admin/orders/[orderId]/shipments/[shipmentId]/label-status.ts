import { requireAdmin } from '../../../../../_lib/adminAuth';
import { refreshEasyshipShipment, type EasyshipShipmentSnapshot } from '../../../../../_lib/easyship';
import {
  ensureShippingLabelsSchema,
  getOrderShipment,
  jsonResponse,
  listOrderShipments,
  orderExists,
  type ShippingLabelsEnv,
} from '../../../../../_lib/shippingLabels';
import { maybeSendTrackingEmail } from '../../../../../_lib/maybeSendTrackingEmail';

const getRouteParams = (request: Request): { orderId: string; shipmentId: string } | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/orders\/([^/]+)\/shipments\/([^/]+)\/label-status$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    orderId: decodeURIComponent(match[1]),
    shipmentId: decodeURIComponent(match[2]),
  };
};

const updateShipmentFromSnapshot = async (
  env: ShippingLabelsEnv,
  orderId: string,
  shipmentId: string,
  snapshot: EasyshipShipmentSnapshot
) => {
  await env.DB.prepare(
    `UPDATE order_shipments
     SET easyship_shipment_id = ?,
         easyship_label_id = ?,
         carrier = COALESCE(?, carrier),
         service = COALESCE(?, service),
         tracking_number = ?,
         label_url = ?,
         label_cost_amount_cents = ?,
         label_currency = ?,
         label_state = ?,
         error_message = NULL,
         updated_at = ?
     WHERE id = ? AND order_id = ?;`
  )
    .bind(
      snapshot.shipmentId || null,
      snapshot.labelId,
      snapshot.carrier,
      snapshot.service,
      snapshot.trackingNumber,
      snapshot.labelUrl,
      snapshot.labelCostAmountCents,
      snapshot.labelCurrency || 'USD',
      snapshot.labelState,
      new Date().toISOString(),
      shipmentId,
      orderId
    )
    .run();
};

export async function onRequestGet(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;
  const params = getRouteParams(context.request);
  if (!params) return jsonResponse({ ok: false, error: 'Missing orderId or shipmentId' }, 400);

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, params.orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found' }, 404);
    }
    const shipment = await getOrderShipment(context.env.DB, params.orderId, params.shipmentId);
    if (!shipment) {
      return jsonResponse({ ok: false, error: 'Shipment not found' }, 404);
    }

    if (!shipment.easyshipShipmentId || (shipment.labelUrl && shipment.trackingNumber)) {
      const shipments = await listOrderShipments(context.env.DB, params.orderId);
      const current = shipments.find((entry) => entry.id === params.shipmentId) || null;
      return jsonResponse({
        ok: true,
        refreshed: false,
        shipment: current,
        shipments,
        pendingRefresh: !!current && current.labelState === 'pending' && !!current.easyshipShipmentId,
      });
    }

    const previousTrackingNumber = shipment.trackingNumber;
    const refreshedSnapshot = await refreshEasyshipShipment(context.env, shipment.easyshipShipmentId);
    await updateShipmentFromSnapshot(context.env, params.orderId, params.shipmentId, refreshedSnapshot);
    const trackingEmailResult = await maybeSendTrackingEmail({
      env: context.env,
      db: context.env.DB,
      orderId: params.orderId,
      shipmentId: params.shipmentId,
      previousTrackingNumber,
      newTrackingNumber: refreshedSnapshot.trackingNumber,
    });
    if (!trackingEmailResult.sent) {
      console.log('[tracking-email] skipped', {
        orderId: params.orderId,
        shipmentId: params.shipmentId,
        reason: trackingEmailResult.skippedReason || 'unknown',
      });
    }
    const shipments = await listOrderShipments(context.env.DB, params.orderId);
    const updated = shipments.find((entry) => entry.id === params.shipmentId) || null;
    return jsonResponse({
      ok: true,
      refreshed: true,
      shipment: updated,
      shipments,
      pendingRefresh: !!updated && updated.labelState === 'pending' && !!updated.easyshipShipmentId,
    });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments/:shipmentId/label-status] failed to refresh label status', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to refresh label status', detail }, 500);
  }
}

export async function onRequest(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestGet(context);
}
