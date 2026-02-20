import { requireAdmin } from '../../../../../_lib/adminAuth';
import {
  buildRateCacheSignaturePayload,
  createShipmentAndBuyLabel,
  fetchEasyshipRates,
  filterAllowedRates,
  getAllowedCarriers,
  isEasyshipDebugEnabled,
  normalizeRateForClient,
  pickCheapestRate,
  refreshEasyshipShipment,
  type EasyshipRawResponseHints,
  type EasyshipRate,
  type EasyshipRateRequest,
  type EasyshipShipmentSnapshot,
} from '../../../../../_lib/easyship';
import {
  digestHex,
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
} from '../../../../../_lib/shippingLabels';
import { maybeSendTrackingEmail } from '../../../../../_lib/maybeSendTrackingEmail';

type CacheRow = {
  rates_json: string;
  expires_at: string;
};

const NO_SHIPPING_SOLUTIONS_MESSAGE =
  'No shipping solutions available based on the information provided. Adjust package details or test in production.';

const getRouteParams = (request: Request): { orderId: string; shipmentId: string } | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/orders\/([^/]+)\/shipments\/([^/]+)\/buy$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    orderId: decodeURIComponent(match[1]),
    shipmentId: decodeURIComponent(match[2]),
  };
};

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseCachedRates = (raw: string): EasyshipRate[] => {
  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [];
    return decoded
      .map((entry: any): EasyshipRate | null => {
        if (!entry || typeof entry !== 'object') return null;
        if (!entry.id || !entry.carrier || !entry.service || typeof entry.amountCents !== 'number') return null;
        return {
          id: String(entry.id),
          carrier: String(entry.carrier),
          service: String(entry.service),
          amountCents: Number(entry.amountCents),
          currency: String(entry.currency || 'USD'),
          etaDaysMin: typeof entry.etaDaysMin === 'number' ? entry.etaDaysMin : null,
          etaDaysMax: typeof entry.etaDaysMax === 'number' ? entry.etaDaysMax : null,
          raw: entry.raw ?? entry,
        };
      })
      .filter((entry): entry is EasyshipRate => !!entry);
  } catch {
    return [];
  }
};

const maybeDebugHints = (rawResponseHints: EasyshipRawResponseHints | undefined): Record<string, unknown> =>
  rawResponseHints
    ? {
        rawResponseHints,
      }
    : {};

const toEasyshipRateRequest = (
  shipFrom: Awaited<ReturnType<typeof readShippingSettings>>,
  destination: NonNullable<Awaited<ReturnType<typeof getOrderDestination>>>,
  dimensions: NonNullable<ReturnType<typeof resolveShipmentDimensions>>,
  items: EasyshipOrderItem[]
): EasyshipRateRequest => ({
  origin: {
    name: shipFrom.shipFromName,
    companyName: shipFrom.shipFromCompany || 'Dover Designs',
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

const persistQuotesCache = async (
  env: ShippingLabelsEnv,
  orderId: string,
  shipmentTempKey: string,
  rates: EasyshipRate[],
  nowIso: string
) => {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO order_rate_quotes (id, order_id, shipment_temp_key, rates_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id, shipment_temp_key) DO UPDATE SET
       rates_json = excluded.rates_json,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at;`
  )
    .bind(
      crypto.randomUUID(),
      orderId,
      shipmentTempKey,
      JSON.stringify(rates.map(normalizeRateForClient)),
      nowIso,
      expiresAt
    )
    .run();
};

const updateShipmentFromSnapshot = async (
  env: ShippingLabelsEnv,
  orderId: string,
  shipmentId: string,
  quoteSelectedId: string | null,
  snapshot: EasyshipShipmentSnapshot,
  errorMessage: string | null,
  selectedRate?: { carrier: string; service: string } | null
) => {
  const now = new Date().toISOString();
  const carrierToStore = trimOrNull(snapshot.carrier) ?? trimOrNull(selectedRate?.carrier) ?? null;
  const serviceToStore = trimOrNull(snapshot.service) ?? trimOrNull(selectedRate?.service) ?? null;
  await env.DB.prepare(
    `UPDATE order_shipments
     SET easyship_shipment_id = ?,
         easyship_label_id = ?,
         carrier = ?,
         service = ?,
         tracking_number = ?,
         label_url = ?,
         label_cost_amount_cents = ?,
         label_currency = ?,
         label_state = ?,
         quote_selected_id = ?,
         error_message = ?,
         purchased_at = COALESCE(purchased_at, ?),
         updated_at = ?
     WHERE id = ? AND order_id = ?;`
  )
    .bind(
      snapshot.shipmentId || null,
      snapshot.labelId,
      carrierToStore,
      serviceToStore,
      snapshot.trackingNumber,
      snapshot.labelUrl,
      snapshot.labelCostAmountCents,
      snapshot.labelCurrency || 'USD',
      snapshot.labelState,
      quoteSelectedId,
      errorMessage,
      now,
      now,
      shipmentId,
      orderId
    )
    .run();
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
      if (isEasyshipDebugEnabled(context.env)) {
        console.log('[easyship][debug] buy preflight failed', {
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          reason: 'order not found',
        });
      }
      return jsonResponse({ ok: false, error: 'Order not found' }, 404);
    }
    const shipment = await getOrderShipment(context.env.DB, params.orderId, params.shipmentId);
    if (!shipment) {
      if (isEasyshipDebugEnabled(context.env)) {
        console.log('[easyship][debug] buy preflight failed', {
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          reason: 'shipment not found',
        });
      }
      return jsonResponse({ ok: false, error: 'Shipment not found' }, 404);
    }

    const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
    const refresh = body?.refresh === true;
    let selectedQuoteId = trimOrNull(body?.quoteSelectedId) || shipment.quoteSelectedId || null;
    const previousTrackingNumber = shipment.trackingNumber;

    if (shipment.labelState === 'generated' || shipment.purchasedAt) {
      if (!refresh) {
        return jsonResponse(
          {
            ok: false,
            code: shipment.labelState === 'generated' ? 'SHIPMENT_ALREADY_PURCHASED' : 'LABEL_PENDING_USE_REFRESH',
            error:
              shipment.labelState === 'generated'
                ? 'Label already purchased for this shipment.'
                : 'Label purchase is pending. Use refresh instead of buying again.',
          },
          409
        );
      }
      if (!shipment.easyshipShipmentId) {
        return jsonResponse(
          { ok: false, code: 'MISSING_EASYSHIP_SHIPMENT', error: 'Shipment has no Easyship shipment id to refresh.' },
          409
        );
      }

      const refreshed = await refreshEasyshipShipment(context.env, shipment.easyshipShipmentId);
      await updateShipmentFromSnapshot(
        context.env,
        params.orderId,
        params.shipmentId,
        selectedQuoteId,
        refreshed,
        null,
        null
      );
      const trackingEmailResult = await maybeSendTrackingEmail({
        env: context.env,
        db: context.env.DB,
        orderId: params.orderId,
        shipmentId: params.shipmentId,
        previousTrackingNumber,
        newTrackingNumber: refreshed.trackingNumber,
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
      return jsonResponse({ ok: true, refreshed: true, shipment: updated, shipments });
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
      if (isEasyshipDebugEnabled(context.env)) {
        console.log('[easyship][debug] buy preflight parcel guard failed', {
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          reason: 'resolveShipmentDimensions returned null',
          effectiveLengthIn: shipment.effectiveLengthIn,
          effectiveWidthIn: shipment.effectiveWidthIn,
          effectiveHeightIn: shipment.effectiveHeightIn,
          weightLb: shipment.weightLb,
        });
      }
      return jsonResponse(
        {
          ok: false,
          code: 'PARCEL_INCOMPLETE',
          error: 'Shipment is missing box dimensions or weight. Please fill them in before buying a label.',
        },
        400
      );
    }
    const expectedParcelsCount =
      dimensions.lengthIn > 0 && dimensions.widthIn > 0 && dimensions.heightIn > 0 && dimensions.weightLb > 0 ? 1 : 0;
    if (expectedParcelsCount === 0) {
      if (isEasyshipDebugEnabled(context.env)) {
        console.log('[easyship][debug] buy preflight parcel guard failed', {
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          reason: 'computed parcels count is 0',
          dimensions,
        });
      }
      return jsonResponse(
        {
          ok: false,
          code: 'PARCEL_INCOMPLETE',
          error: 'Shipment is missing box dimensions or weight. Please fill them in before buying a label.',
        },
        400
      );
    }

    const orderItems = await getOrderItemsForEasyship(context.env.DB, params.orderId);
    const allowedCarriers = getAllowedCarriers(context.env);
    if (isEasyshipDebugEnabled(context.env)) {
      console.log('[easyship][debug] buy carrier filter', {
        orderId: params.orderId,
        shipmentId: params.shipmentId,
        allowedCarrierCount: allowedCarriers.length,
        allowedCarriers,
      });
    }
    const rateRequest = toEasyshipRateRequest(shipFrom, destination!, dimensions, orderItems);
    if (!trimOrNull(rateRequest.destination.phone)) {
      return jsonResponse(
        {
          ok: false,
          code: 'DESTINATION_PHONE_REQUIRED',
          error: 'Missing destination phone number (required for Easyship).',
        },
        400
      );
    }
    const signaturePayload = buildRateCacheSignaturePayload({
      orderId: params.orderId,
      destination: rateRequest.destination,
      dimensions,
      allowedCarriers,
    });
    const shipmentTempKey = await digestHex(signaturePayload);
    const nowIso = new Date().toISOString();

    const cached = await context.env.DB.prepare(
      `SELECT rates_json, expires_at
       FROM order_rate_quotes
       WHERE order_id = ? AND shipment_temp_key = ? AND expires_at > ?
       ORDER BY datetime(created_at) DESC
       LIMIT 1;`
    )
      .bind(params.orderId, shipmentTempKey, nowIso)
      .first<CacheRow>();

    let rates = cached?.rates_json ? parseCachedRates(cached.rates_json) : [];
    if (!rates.length) {
      const liveRates = await fetchEasyshipRates(context.env, rateRequest);
      if (isEasyshipDebugEnabled(context.env)) {
        console.log('[easyship][debug] buy rates pre filter', {
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          rawRatesCount: liveRates.rates.length,
          rawResponseHints: liveRates.rawResponseHints || null,
        });
      }
      if (!liveRates.rates.length) {
        return jsonResponse(
          {
            ok: false,
            code: 'NO_RATES',
            error: liveRates.warning || NO_SHIPPING_SOLUTIONS_MESSAGE,
            message: liveRates.warning || NO_SHIPPING_SOLUTIONS_MESSAGE,
            ...maybeDebugHints(liveRates.rawResponseHints),
          },
          400
        );
      }
      rates = filterAllowedRates(liveRates.rates, allowedCarriers).sort((a, b) => a.amountCents - b.amountCents);
      if (!rates.length) {
        return jsonResponse(
          {
            ok: false,
            code: 'NO_QUOTES',
            error: 'No supported carrier quotes found for this parcel.',
            ...maybeDebugHints(liveRates.rawResponseHints),
          },
          422
        );
      }
      await persistQuotesCache(context.env, params.orderId, shipmentTempKey, rates, nowIso);
    }

    let selectedRate: EasyshipRate | null = null;
    if (selectedQuoteId) {
      selectedRate = rates.find((rate) => rate.id === selectedQuoteId) || null;
      if (!selectedRate) {
        return jsonResponse(
          { ok: false, code: 'QUOTE_NOT_FOUND', error: 'Selected quote not found for this shipment.' },
          400
        );
      }
    } else {
      selectedRate = pickCheapestRate(rates);
      selectedQuoteId = selectedRate?.id || null;
    }
    if (!selectedRate || !selectedQuoteId) {
      return jsonResponse({ ok: false, code: 'NO_RATE_SELECTED', error: 'No rate available for label purchase.' }, 400);
    }

    if (isEasyshipDebugEnabled(context.env)) {
      console.log('[easyship][debug] buy create-shipment input', {
        orderId: params.orderId,
        shipmentId: params.shipmentId,
        selectedQuoteId,
        dimensions,
        expectedParcelsCount,
        destinationPhonePresent: !!trimOrNull(rateRequest.destination.phone),
        originCompanyPresent: !!trimOrNull(rateRequest.origin.companyName),
      });
    }
    const created = await createShipmentAndBuyLabel(context.env, {
      ...rateRequest,
      courierServiceId: selectedQuoteId,
      externalReference: `${params.orderId}:${params.shipmentId}`,
    });

    await updateShipmentFromSnapshot(
      context.env,
      params.orderId,
      params.shipmentId,
      selectedQuoteId,
      created,
      null,
      { carrier: selectedRate.carrier, service: selectedRate.service }
    );
    const trackingEmailResult = await maybeSendTrackingEmail({
      env: context.env,
      db: context.env.DB,
      orderId: params.orderId,
      shipmentId: params.shipmentId,
      previousTrackingNumber,
      newTrackingNumber: created.trackingNumber,
    });
    if (!trackingEmailResult.sent) {
      console.log('[tracking-email] skipped', {
        orderId: params.orderId,
        shipmentId: params.shipmentId,
        reason: trackingEmailResult.skippedReason || 'unknown',
      });
    }
    await context.env.DB.prepare(
      `UPDATE order_shipments
       SET quote_selected_id = ?, updated_at = ?
       WHERE id = ? AND order_id = ?;`
    )
      .bind(selectedQuoteId, new Date().toISOString(), params.shipmentId, params.orderId)
      .run();

    const shipments = await listOrderShipments(context.env.DB, params.orderId);
    const updated = shipments.find((entry) => entry.id === params.shipmentId) || null;
    return jsonResponse({
      ok: true,
      shipment: updated,
      shipments,
      selectedQuoteId,
      pendingRefresh:
        !!updated && updated.labelState === 'pending' && !!updated.easyshipShipmentId,
    });
  } catch (error) {
    console.error('[admin/orders/:orderId/shipments/:shipmentId/buy] failed to purchase label', error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to purchase label', detail }, 500);
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
