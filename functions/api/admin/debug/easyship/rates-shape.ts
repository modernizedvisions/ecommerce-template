import { requireAdmin } from '../../../_lib/adminAuth';
import {
  buildEasyshipRatesPayload,
  getAllowedCarriers,
  isEasyshipDebugEnabled,
  summarizeEasyshipPayloadShape,
  type EasyshipRateRequest,
} from '../../../_lib/easyship';
import {
  ensureShippingLabelsSchema,
  getOrderDestination,
  getOrderItemsForEasyship,
  getOrderShipment,
  hasRequiredDestination,
  jsonResponse,
  listOrderShipments,
  orderExists,
  readShippingSettings,
  resolveShipmentDimensions,
  type EasyshipOrderItem,
  validateShipFrom,
  type ShippingLabelsEnv,
} from '../../../_lib/shippingLabels';

const normalizeBaseUrl = (value: string | undefined): string => {
  const fallback = 'https://public-api.easyship.com/2024-09';
  const base = (value || fallback).trim() || fallback;
  return base.replace(/\/+$/, '');
};

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toEasyshipRateRequest = (
  shipFrom: Awaited<ReturnType<typeof readShippingSettings>>,
  destination: NonNullable<Awaited<ReturnType<typeof getOrderDestination>>>,
  dimensions: NonNullable<ReturnType<typeof resolveShipmentDimensions>>,
  items: EasyshipOrderItem[]
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
  items: items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    declaredValueCents: item.declaredValueCents,
  })),
});

const parseParcelIndex = (value: string | null): number | 'invalid' | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 'invalid';
  return parsed;
};

export async function onRequestGet(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!isEasyshipDebugEnabled(context.env)) {
    return jsonResponse({ ok: false, error: 'Easyship debug endpoint is disabled.' }, 404);
  }

  const url = new URL(context.request.url);
  const orderId = trimOrNull(url.searchParams.get('orderId'));
  const shipmentId = trimOrNull(url.searchParams.get('shipmentId'));
  const parcelIndex = parseParcelIndex(trimOrNull(url.searchParams.get('parcelIndex')));

  if (!orderId) {
    return jsonResponse({ ok: false, error: 'Missing orderId query parameter.' }, 400);
  }
  if (parcelIndex === 'invalid') {
    return jsonResponse({ ok: false, error: 'parcelIndex must be a positive integer when provided.' }, 400);
  }

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found.' }, 404);
    }

    let shipment = shipmentId ? await getOrderShipment(context.env.DB, orderId, shipmentId) : null;
    if (shipmentId && !shipment) {
      return jsonResponse({ ok: false, error: 'Shipment not found for supplied shipmentId.' }, 404);
    }
    if (!shipment) {
      const shipments = await listOrderShipments(context.env.DB, orderId);
      if (shipments.length === 0) {
        return jsonResponse({ ok: false, error: 'No shipments found for order.' }, 404);
      }
      if (parcelIndex !== null) {
        shipment = shipments.find((entry) => entry.parcelIndex === parcelIndex) || null;
      } else {
        shipment = shipments[0] || null;
      }
    }
    if (!shipment) {
      return jsonResponse({ ok: false, error: 'Shipment not found for supplied shipmentId/parcelIndex.' }, 404);
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

    const destination = await getOrderDestination(context.env.DB, orderId);
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

    const orderItems = await getOrderItemsForEasyship(context.env.DB, orderId);
    const requestBody = buildEasyshipRatesPayload(toEasyshipRateRequest(shipFrom, destination!, dimensions, orderItems));
    const payloadShape = summarizeEasyshipPayloadShape(requestBody);
    const baseUrl = normalizeBaseUrl(context.env.EASYSHIP_API_BASE_URL);
    const ratesUrl = `${baseUrl}/rates`;
    const parsedRatesUrl = new URL(ratesUrl);
    const token = trimOrNull(context.env.EASYSHIP_TOKEN);

    return jsonResponse({
      ok: true,
      debugEnabled: true,
      endpoint: {
        host: parsedRatesUrl.host,
        path: parsedRatesUrl.pathname,
      },
      envPresent: {
        EASYSHIP_API_BASE_URL: !!trimOrNull(context.env.EASYSHIP_API_BASE_URL),
        EASYSHIP_TOKEN: !!token,
        EASYSHIP_ALLOWED_CARRIERS: !!trimOrNull(context.env.EASYSHIP_ALLOWED_CARRIERS),
      },
      tokenLength: token ? token.length : 0,
      allowedCarriers: getAllowedCarriers(context.env),
      selectedShipment: {
        id: shipment.id,
        parcelIndex: shipment.parcelIndex,
      },
      bodyTopLevelKeys: payloadShape.topLevelKeys,
      hasShipmentWrapper: payloadShape.hasShipmentWrapper,
      shipmentWrapperKeys: payloadShape.shipmentWrapperKeys,
      parcelsCount: payloadShape.parcelsCount,
      firstParcelKeys: payloadShape.firstParcelKeys,
      firstParcelItemsIsArray: payloadShape.firstParcelItemsIsArray,
      firstParcelItemsLength: payloadShape.firstParcelItemsLength,
      firstParcelFirstItemKeys: payloadShape.firstParcelFirstItemKeys,
      firstParcelFirstItemHasCategory: payloadShape.firstParcelFirstItemHasCategory,
      bodySkeleton: payloadShape.skeleton,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to build Easyship rate payload shape.', detail }, 500);
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
