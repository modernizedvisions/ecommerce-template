import { requireAdmin } from '../../../../../_lib/adminAuth';
import {
  buildRateCacheSignaturePayload,
  fetchEasyshipRates,
  filterAllowedRates,
  getAllowedCarriers,
  normalizeRateForClient,
  pickCheapestRate,
  type EasyshipRateRequest,
} from '../../../../../_lib/easyship';
import {
  digestHex,
  ensureShippingLabelsSchema,
  getOrderDestination,
  getOrderShipment,
  hasRequiredDestination,
  jsonResponse,
  listOrderShipments,
  orderExists,
  readShippingSettings,
  resolveShipmentDimensions,
  validateShipFrom,
  type ShippingLabelsEnv,
} from '../../../../../_lib/shippingLabels';

type CacheRow = {
  id: string;
  rates_json: string;
  expires_at: string;
};

const getRouteParams = (request: Request): { orderId: string; shipmentId: string } | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/orders\/([^/]+)\/shipments\/([^/]+)\/quotes$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    orderId: decodeURIComponent(match[1]),
    shipmentId: decodeURIComponent(match[2]),
  };
};

const toEasyshipRateRequest = (
  shipFrom: Awaited<ReturnType<typeof readShippingSettings>>,
  destination: NonNullable<Awaited<ReturnType<typeof getOrderDestination>>>,
  dimensions: NonNullable<ReturnType<typeof resolveShipmentDimensions>>
): EasyshipRateRequest => ({
  origin: {
    name: shipFrom.shipFromName,
    phone: shipFrom.shipFromPhone || null,
    addressLine1: shipFrom.shipFromAddress1,
    addressLine2: shipFrom.shipFromAddress2 || null,
    city: shipFrom.shipFromCity,
    state: shipFrom.shipFromState,
    postalCode: shipFrom.shipFromPostal,
    countryCode: shipFrom.shipFromCountry || 'US',
  },
  destination: {
    name: destination.name || 'Customer',
    companyName: destination.companyName || null,
    email: destination.email || null,
    phone: destination.phone || null,
    addressLine1: destination.line1 || '',
    addressLine2: destination.line2 || null,
    city: destination.city || '',
    state: destination.state || '',
    postalCode: destination.postalCode || '',
    countryCode: destination.country || 'US',
  },
  dimensions,
});

const parseCachedRates = (raw: string): ReturnType<typeof normalizeRateForClient>[] => {
  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [];
    return decoded.filter((entry) => entry && typeof entry === 'object');
  } catch {
    return [];
  }
};

export async function onRequestPost(
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

    const shipFrom = await readShippingSettings(context.env.DB);
    const missingShipFrom = validateShipFrom(shipFrom);
    if (missingShipFrom.length) {
      return jsonResponse(
        {
          ok: false,
          code: 'SHIP_FROM_INCOMPLETE',
          error: 'Ship-from settings are incomplete.',
          missing: missingShipFrom,
        },
        400
      );
    }

    const destination = await getOrderDestination(context.env.DB, params.orderId);
    if (!hasRequiredDestination(destination)) {
      return jsonResponse(
        { ok: false, code: 'DESTINATION_INCOMPLETE', error: 'Order shipping destination is incomplete.' },
        400
      );
    }

    const dimensions = resolveShipmentDimensions(shipment);
    if (!dimensions) {
      return jsonResponse(
        { ok: false, code: 'PARCEL_INCOMPLETE', error: 'Shipment is missing dimensions or weight.' },
        400
      );
    }

    const allowedCarriers = getAllowedCarriers(context.env);
    const rateRequest = toEasyshipRateRequest(shipFrom, destination!, dimensions);
    const signaturePayload = buildRateCacheSignaturePayload({
      orderId: params.orderId,
      destination: rateRequest.destination,
      dimensions,
      allowedCarriers,
    });
    const shipmentTempKey = await digestHex(signaturePayload);
    const now = new Date();
    const nowIso = now.toISOString();

    const cached = await context.env.DB.prepare(
      `SELECT id, rates_json, expires_at
       FROM order_rate_quotes
       WHERE order_id = ? AND shipment_temp_key = ? AND expires_at > ?
       ORDER BY datetime(created_at) DESC
       LIMIT 1;`
    )
      .bind(params.orderId, shipmentTempKey, nowIso)
      .first<CacheRow>();
    if (cached?.rates_json) {
      const rates = parseCachedRates(cached.rates_json);
      const cheapest = [...rates].sort((a: any, b: any) => (a.amountCents || 0) - (b.amountCents || 0))[0] || null;
      if (cheapest?.id) {
        await context.env.DB.prepare(
          `UPDATE order_shipments
           SET quote_selected_id = ?, updated_at = ?
           WHERE id = ? AND order_id = ?;`
        )
          .bind(cheapest.id, nowIso, params.shipmentId, params.orderId)
          .run();
      }
      const shipments = await listOrderShipments(context.env.DB, params.orderId);
      return jsonResponse({
        ok: true,
        cached: true,
        expiresAt: cached.expires_at,
        shipmentTempKey,
        rates,
        selectedQuoteId: cheapest?.id || null,
        shipments,
      });
    }

    const rawRates = await fetchEasyshipRates(context.env, rateRequest);
    const allowedRates = filterAllowedRates(rawRates, allowedCarriers).sort((a, b) => a.amountCents - b.amountCents);
    if (!allowedRates.length) {
      return jsonResponse(
        { ok: false, code: 'NO_QUOTES', error: 'No supported carrier quotes found for this parcel.' },
        422
      );
    }

    const normalizedRates = allowedRates.map(normalizeRateForClient);
    const cheapest = pickCheapestRate(allowedRates);
    const selectedQuoteId = cheapest?.id || null;
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    await context.env.DB.prepare(
      `INSERT INTO order_rate_quotes (id, order_id, shipment_temp_key, rates_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id, shipment_temp_key) DO UPDATE SET
         rates_json = excluded.rates_json,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at;`
    )
      .bind(crypto.randomUUID(), params.orderId, shipmentTempKey, JSON.stringify(normalizedRates), nowIso, expiresAt)
      .run();

    await context.env.DB.prepare(
      `UPDATE order_shipments
       SET quote_selected_id = ?, updated_at = ?
       WHERE id = ? AND order_id = ?;`
    )
      .bind(selectedQuoteId, nowIso, params.shipmentId, params.orderId)
      .run();

    const shipments = await listOrderShipments(context.env.DB, params.orderId);
    return jsonResponse({
      ok: true,
      cached: false,
      shipmentTempKey,
      expiresAt,
      rates: normalizedRates,
      selectedQuoteId,
      shipments,
    });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments/:shipmentId/quotes] failed to fetch quotes', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to fetch quotes', detail }, 500);
  }
}

export async function onRequest(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}

