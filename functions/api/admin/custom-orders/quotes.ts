import { requireAdmin } from '../../_lib/adminAuth';
import {
  fetchEasyshipRates,
  filterAllowedRates,
  getAllowedCarriers,
  isEasyshipDebugEnabled,
  normalizeRateForClient,
  pickCheapestRate,
  type EasyshipRateItem,
  type EasyshipRateRequest,
} from '../../_lib/easyship';
import {
  ensureShippingLabelsSchema,
  jsonResponse,
  readShippingSettings,
  validateShipFrom,
  type ShippingLabelsEnv,
} from '../../_lib/shippingLabels';

type CustomOrderQuotePayload = {
  destination?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  dimensions?: {
    lengthIn?: number | null;
    widthIn?: number | null;
    heightIn?: number | null;
    weightLb?: number | null;
  } | null;
  amountCents?: number | null;
  description?: string | null;
  items?: Array<{
    description?: string | null;
    quantity?: number | null;
    declaredValueCents?: number | null;
  }> | null;
};

type SanitizedDestination = {
  name: string | null;
  email: string | null;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type SanitizedDimensions = {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
};

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toPositiveNumberOrNull = (value: unknown): number | null => {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null || numeric <= 0) return null;
  return numeric;
};

const toNonNegativeIntegerOrNull = (value: unknown): number | null => {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null || numeric < 0) return null;
  return Math.round(numeric);
};

const sanitizeDestination = (destination: CustomOrderQuotePayload['destination']): SanitizedDestination => {
  const source = destination && typeof destination === 'object' ? destination : {};
  return {
    name: trimOrNull(source.name),
    email: trimOrNull(source.email),
    phone: trimOrNull(source.phone) || '',
    line1: trimOrNull(source.line1) || '',
    line2: trimOrNull(source.line2),
    city: trimOrNull(source.city) || '',
    state: trimOrNull(source.state) || '',
    postalCode: trimOrNull(source.postalCode) || '',
    country: (trimOrNull(source.country) || 'US').toUpperCase(),
  };
};

const getDestinationMissingFields = (destination: SanitizedDestination): string[] => {
  const missing: string[] = [];
  if (!destination.line1) missing.push('line1');
  if (!destination.city) missing.push('city');
  if (!destination.state) missing.push('state');
  if (!destination.postalCode) missing.push('postalCode');
  if (!destination.country) missing.push('country');
  if (!destination.phone) missing.push('phone');
  return missing;
};

const sanitizeDimensions = (dimensions: CustomOrderQuotePayload['dimensions']): SanitizedDimensions | null => {
  const source = dimensions && typeof dimensions === 'object' ? dimensions : {};
  const lengthIn = toPositiveNumberOrNull(source.lengthIn);
  const widthIn = toPositiveNumberOrNull(source.widthIn);
  const heightIn = toPositiveNumberOrNull(source.heightIn);
  const weightLb = toPositiveNumberOrNull(source.weightLb);
  if (lengthIn === null || widthIn === null || heightIn === null || weightLb === null) return null;
  return { lengthIn, widthIn, heightIn, weightLb };
};

const sanitizeItems = (
  items: CustomOrderQuotePayload['items'],
  fallbackDescription: string | null,
  fallbackAmountCents: number | null
): EasyshipRateItem[] => {
  const mapped = (Array.isArray(items) ? items : [])
    .map((item): EasyshipRateItem | null => {
      if (!item || typeof item !== 'object') return null;
      const description = trimOrNull(item.description) || fallbackDescription || 'Custom order';
      const quantityRaw = toFiniteNumberOrNull(item.quantity);
      const quantity = quantityRaw && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
      const declaredValueCents = toNonNegativeIntegerOrNull(item.declaredValueCents);
      return {
        description,
        quantity,
        declaredValueCents: declaredValueCents === null ? Math.max(1, fallbackAmountCents || 1) : declaredValueCents,
      };
    })
    .filter((item): item is EasyshipRateItem => !!item);

  if (mapped.length) return mapped;
  return [
    {
      description: fallbackDescription || 'Custom order',
      quantity: 1,
      declaredValueCents: Math.max(1, fallbackAmountCents || 1),
    },
  ];
};

const buildRateRequest = (
  shipFrom: Awaited<ReturnType<typeof readShippingSettings>>,
  payload: CustomOrderQuotePayload
): { rateRequest: EasyshipRateRequest | null; destinationMissing: string[] } => {
  const destination = sanitizeDestination(payload.destination);
  const destinationMissing = getDestinationMissingFields(destination);
  const dimensions = sanitizeDimensions(payload.dimensions);
  if (destinationMissing.length || !dimensions) {
    return { rateRequest: null, destinationMissing };
  }

  const amountCents = toNonNegativeIntegerOrNull(payload.amountCents);
  const description = trimOrNull(payload.description) || 'Custom order';
  const items = sanitizeItems(payload.items, description, amountCents);

  return {
    destinationMissing: [],
    rateRequest: {
      origin: {
        name: shipFrom.shipFromName,
        companyName: shipFrom.shipFromCompany || 'Dover Designs',
        phone: trimOrNull(shipFrom.shipFromPhone),
        addressLine1: shipFrom.shipFromAddress1,
        addressLine2: trimOrNull(shipFrom.shipFromAddress2),
        city: shipFrom.shipFromCity,
        state: shipFrom.shipFromState,
        postalCode: shipFrom.shipFromPostal,
        countryCode: shipFrom.shipFromCountry || 'US',
      },
      destination: {
        name: destination.name || 'Customer',
        email: destination.email,
        phone: destination.phone,
        addressLine1: destination.line1,
        addressLine2: destination.line2,
        city: destination.city,
        state: destination.state,
        postalCode: destination.postalCode,
        countryCode: destination.country,
      },
      dimensions,
      items,
    },
  };
};

const maybeDebugHints = (enabled: boolean, hints: unknown): Record<string, unknown> =>
  enabled ? { rawResponseHints: hints } : {};

export async function onRequestPost(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as CustomOrderQuotePayload | null;
    if (!body || typeof body !== 'object') {
      return jsonResponse({ ok: false, code: 'INVALID_BODY', error: 'Request body is required.' }, 400);
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

    const { rateRequest, destinationMissing } = buildRateRequest(shipFrom, body);
    if (destinationMissing.length) {
      return jsonResponse(
        {
          ok: false,
          code: 'DESTINATION_INCOMPLETE',
          error: 'Add a shipping address to get quotes.',
          missing: destinationMissing,
        },
        400
      );
    }
    if (!rateRequest) {
      return jsonResponse(
        {
          ok: false,
          code: 'PARCEL_INCOMPLETE',
          error: 'Length, width, height, and weight are required to get quotes.',
        },
        400
      );
    }

    const debugEnabled = isEasyshipDebugEnabled(context.env);
    const allowedCarriers = getAllowedCarriers(context.env);
    const liveRates = await fetchEasyshipRates(context.env, rateRequest);
    const allowedRates = filterAllowedRates(liveRates.rates, allowedCarriers).sort((a, b) => a.amountCents - b.amountCents);
    const normalizedRates = allowedRates.map(normalizeRateForClient);
    const cheapest = pickCheapestRate(allowedRates);

    if (debugEnabled) {
      console.log('[easyship][debug] custom order quotes summary', {
        allowedCarrierCount: allowedCarriers.length,
        rawRatesCount: liveRates.rates.length,
        filteredRatesCount: allowedRates.length,
        hasWarning: !!liveRates.warning,
      });
    }

    if (!normalizedRates.length) {
      return jsonResponse(
        {
          ok: false,
          code: 'NO_RATES',
          error: liveRates.warning || 'No supported carrier quotes found.',
          warning: liveRates.warning || null,
          ...maybeDebugHints(debugEnabled, liveRates.rawResponseHints || null),
        },
        400
      );
    }

    return jsonResponse({
      ok: true,
      rates: normalizedRates,
      cheapest: cheapest ? normalizeRateForClient(cheapest) : null,
      warning: liveRates.warning || null,
      ...maybeDebugHints(debugEnabled, liveRates.rawResponseHints || null),
    });
  } catch (error) {
    console.error('[admin/custom-orders/quotes] failed to fetch quotes', error);
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

