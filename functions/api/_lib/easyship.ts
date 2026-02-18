type EasyshipEnv = {
  EASYSHIP_TOKEN?: string;
  EASYSHIP_API_BASE_URL?: string;
  EASYSHIP_ALLOWED_CARRIERS?: string;
  EASYSHIP_MOCK?: string;
  EASYSHIP_DEBUG?: string;
};

export type EasyshipRate = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  etaDaysMin: number | null;
  etaDaysMax: number | null;
  raw: unknown;
};

export type EasyshipRateItem = {
  description: string;
  quantity: number;
  declaredValueCents?: number | null;
};

export type EasyshipRawResponseHints = {
  status: number;
  hasError: boolean;
  errorCode?: string | null;
};

export type EasyshipRatesResult = {
  rates: EasyshipRate[];
  warning: string | null;
  rawResponseHints?: EasyshipRawResponseHints;
};

export type EasyshipDebugRequestResult = {
  ok: boolean;
  status: number;
  endpoint: {
    host: string;
    path: string;
  };
  contentType: string | null;
  responseTopKeys: string[];
  warning: string | null;
  message: string | null;
  hasError: boolean;
  errorCode: string | null;
  ratesLength: number | null;
  data: unknown;
};

const NO_SHIPPING_SOLUTIONS_DETAIL = 'No shipping solutions available based on the information provided';

export type EasyshipShipmentSnapshot = {
  shipmentId: string;
  labelId: string | null;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  labelCostAmountCents: number | null;
  labelCurrency: string;
  labelState: 'pending' | 'generated' | 'failed';
  raw: unknown;
};

type EasyshipAddressInput = {
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

export type EasyshipRateRequest = {
  origin: EasyshipAddressInput;
  destination: EasyshipAddressInput;
  dimensions: { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };
  items?: EasyshipRateItem[];
};

// Easyship v2024-09 docs include "fashion" in the official Rates request example.
const DEFAULT_EASYSHIP_ITEM_CATEGORY = 'fashion';

export type EasyshipCreateShipmentRequest = EasyshipRateRequest & {
  courierServiceId: string;
  externalReference?: string | null;
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toAmountCents = (value: unknown): number | null => {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null) return null;
  return Math.round(numeric * 100);
};

const poundsToKg = (valueLb: number): number => valueLb * 0.45359237;
const inchesToCm = (valueIn: number): number => valueIn * 2.54;

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const objectKeys = (value: unknown): string[] => (isObjectRecord(value) ? Object.keys(value) : []);

const buildRedactedSkeleton = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (depth >= 6) return '[array]';
    return value.length ? [buildRedactedSkeleton(value[0], depth + 1)] : [];
  }
  if (isObjectRecord(value)) {
    if (depth >= 6) return '[object]';
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const nested = value[key];
      if (nested === null || nested === undefined) {
        output[key] = null;
      } else if (typeof nested === 'object') {
        output[key] = buildRedactedSkeleton(nested, depth + 1);
      } else {
        output[key] = '[present]';
      }
    }
    return output;
  }
  return '[present]';
};

export const isEasyshipDebugEnabled = (env: EasyshipEnv): boolean => {
  const raw = trimOrNull(env.EASYSHIP_DEBUG);
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  return normalized === 'true' || normalized === '1';
};

export const summarizeEasyshipPayloadShape = (payload: unknown) => {
  const topLevelKeys = objectKeys(payload);
  const shipmentValue = isObjectRecord(payload) ? payload.shipment : undefined;
  const shipmentKeys = objectKeys(shipmentValue);
  const topLevelParcels = isObjectRecord(payload) && Array.isArray(payload.parcels) ? payload.parcels : [];
  const shipmentParcels =
    isObjectRecord(shipmentValue) && Array.isArray(shipmentValue.parcels) ? shipmentValue.parcels : [];
  const parcels = topLevelParcels.length ? topLevelParcels : shipmentParcels;
  const firstParcel = parcels[0];
  const firstParcelKeys = objectKeys(firstParcel);
  const firstParcelItems =
    isObjectRecord(firstParcel) && Array.isArray(firstParcel.items)
      ? firstParcel.items
      : isObjectRecord(firstParcel) && isObjectRecord(firstParcel.item)
      ? [firstParcel.item]
      : null;
  const firstParcelFirstItem = Array.isArray(firstParcelItems) ? firstParcelItems[0] : undefined;
  const firstParcelFirstItemKeys = objectKeys(firstParcelFirstItem);
  return {
    topLevelKeys,
    hasShipmentWrapper: topLevelKeys.includes('shipment'),
    shipmentWrapperKeys: shipmentKeys,
    parcelSource: topLevelParcels.length ? 'top_level' : shipmentParcels.length ? 'shipment_wrapper' : 'none',
    parcelsCount: parcels.length,
    firstParcelKeys,
    firstParcelItemsIsArray: Array.isArray(firstParcelItems),
    firstParcelItemsLength: Array.isArray(firstParcelItems) ? firstParcelItems.length : 0,
    firstParcelFirstItemKeys,
    firstParcelFirstItemHasCategory: firstParcelFirstItemKeys.includes('category'),
    skeleton: buildRedactedSkeleton(payload),
  };
};

const summarizeRateMetricsForDebug = (input: EasyshipRateRequest, payload: unknown) => {
  const parcels = isObjectRecord(payload) && Array.isArray(payload.parcels) ? payload.parcels : [];
  const firstParcel = isObjectRecord(parcels[0]) ? parcels[0] : {};
  const firstBox = isObjectRecord(firstParcel.box) ? firstParcel.box : {};
  const firstItems =
    isObjectRecord(firstParcel) && Array.isArray(firstParcel.items)
      ? (firstParcel.items as Array<Record<string, unknown>>)
      : [];
  const origin = isObjectRecord(payload) && isObjectRecord(payload.origin_address) ? payload.origin_address : {};
  const destination =
    isObjectRecord(payload) && isObjectRecord(payload.destination_address) ? payload.destination_address : {};
  const firstItem = firstItems[0] || {};

  return {
    parcelMetrics: {
      weight_lb: Number(input.dimensions.weightLb.toFixed(3)),
      weight_kg: Number((Number(firstParcel.total_actual_weight) || 0).toFixed(3)),
      dims_in: {
        length: Number(input.dimensions.lengthIn.toFixed(2)),
        width: Number(input.dimensions.widthIn.toFixed(2)),
        height: Number(input.dimensions.heightIn.toFixed(2)),
      },
      dims_cm: {
        length: Number((Number(firstBox.length) || 0).toFixed(2)),
        width: Number((Number(firstBox.width) || 0).toFixed(2)),
        height: Number((Number(firstBox.height) || 0).toFixed(2)),
      },
    },
    addressSignals: {
      origin: {
        country: trimOrNull(origin.country_alpha2),
        postal: trimOrNull(origin.postal_code),
        hasState: !!trimOrNull(origin.state),
      },
      destination: {
        country: trimOrNull(destination.country_alpha2),
        postal: trimOrNull(destination.postal_code),
        hasState: !!trimOrNull(destination.state),
      },
    },
    itemsSignals: {
      count: firstItems.length,
      hasCategory: !!trimOrNull(firstItem.category),
      hasHsCode: !!trimOrNull(firstItem.hs_code),
    },
  };
};

const toIsoNoMs = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

const normalizeBaseUrl = (value: string | undefined): string => {
  const fallback = 'https://public-api.easyship.com/2024-09';
  const base = (value || fallback).trim() || fallback;
  return base.replace(/\/+$/, '');
};

const parseAllowedCarriers = (value: string | undefined): string[] => {
  if (!value || !value.trim()) return [];
  const parsed = value
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length ? Array.from(new Set(parsed)) : [];
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

const maybeText = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  return String(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const extractRawRatesArray = (data: any): any[] =>
  Array.isArray(data?.rates)
    ? data.rates
    : Array.isArray(data?.couriers)
    ? data.couriers
    : Array.isArray(data?.data?.rates)
    ? data.data.rates
    : Array.isArray(data?.data?.couriers)
    ? data.data.couriers
    : [];

const truncateText = (value: string | null, maxLength = 240): string | null => {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
};

const getResponseTopKeys = (data: unknown): string[] => (isObjectRecord(data) ? Object.keys(data) : []);

const getResponseErrorCode = (data: any): string | null =>
  trimOrNull(data?.error?.code) || trimOrNull(data?.code) || null;

const getResponseWarning = (data: any): string | null =>
  trimOrNull(data?.warning) ||
  trimOrNull(data?.message) ||
  trimOrNull(data?.detail) ||
  trimOrNull(data?.error?.message) ||
  trimOrNull(data?.error) ||
  null;

const getResponseMessage = (data: any): string | null =>
  trimOrNull(data?.message) ||
  trimOrNull(data?.detail) ||
  trimOrNull(data?.warning) ||
  trimOrNull(data?.error?.message) ||
  trimOrNull(data?.error) ||
  null;

const getResponseHasErrorShape = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  const statusRaw = trimOrNull(data.status) || '';
  const status = statusRaw.toLowerCase();
  return Boolean(
    data.error ||
      (Array.isArray(data.errors) && data.errors.length > 0) ||
      status === 'error' ||
      status === 'failed' ||
      getResponseErrorCode(data)
  );
};

const getResponseErrorDetailsLength = (data: any): number | null => {
  const details = data?.error?.details;
  if (Array.isArray(details)) return details.length;
  if (typeof details === 'string') return details.length;
  if (details && typeof details === 'object') return Object.keys(details).length;
  return null;
};

const getRatesArrayLengthHint = (data: any): number | null => {
  if (Array.isArray(data?.rates)) return data.rates.length;
  if (Array.isArray(data?.couriers)) return data.couriers.length;
  if (Array.isArray(data?.data?.rates)) return data.data.rates.length;
  if (Array.isArray(data?.data?.couriers)) return data.data.couriers.length;
  return null;
};

class EasyshipHttpError extends Error {
  status: number;
  endpoint: { host: string; path: string };
  warning: string | null;
  errorCode: string | null;
  hasError: boolean;

  constructor(params: {
    message: string;
    status: number;
    endpoint: { host: string; path: string };
    warning: string | null;
    errorCode: string | null;
    hasError: boolean;
  }) {
    super(params.message);
    this.name = 'EasyshipHttpError';
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.warning = params.warning;
    this.errorCode = params.errorCode;
    this.hasError = params.hasError;
  }
}

const parseRatesFromResponse = (data: any): EasyshipRate[] => {
  const source: any[] = extractRawRatesArray(data);

  const stableHash = (value: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const carrierFromFullDescription = (value: string | null): string | null => {
    if (!value) return null;
    const firstToken = value.trim().split(/\s+/)[0] || '';
    const cleaned = firstToken.replace(/[^A-Za-z0-9]/g, '');
    return cleaned || null;
  };

  const deepFindByKeys = (input: unknown, keys: string[], depth = 0): unknown => {
    if (depth > 4 || input === null || input === undefined) return undefined;
    if (Array.isArray(input)) {
      for (const entry of input) {
        const found = deepFindByKeys(entry, keys, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (!isRecord(input)) return undefined;

    for (const [key, value] of Object.entries(input)) {
      if (keys.includes(key)) return value;
    }
    for (const value of Object.values(input)) {
      const found = deepFindByKeys(value, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const readPath = (input: any, path: string): unknown => {
    if (!input || typeof input !== 'object') return undefined;
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, input);
  };

  const firstText = (input: any, paths: string[]): string | null => {
    for (const path of paths) {
      const value = readPath(input, path);
      const text = trimOrNull(value);
      if (text) return text;
    }
    return null;
  };

  const firstAmountCents = (input: any, paths: string[]): number | null => {
    for (const path of paths) {
      const value = readPath(input, path);
      const cents =
        toAmountCents(value) ??
        (isRecord(value)
          ? toAmountCents(value.amount) ??
            toAmountCents(value.total) ??
            toAmountCents(value.value) ??
            toAmountCents(value.price)
          : null);
      if (cents !== null) return cents;
    }
    return null;
  };

  const firstNumber = (input: any, paths: string[]): number | null => {
    for (const path of paths) {
      const value = readPath(input, path);
      const numeric = toFiniteNumberOrNull(value);
      if (numeric !== null) return numeric;
    }
    return null;
  };

  const normalized = source
    .map((rate: any, index: number): EasyshipRate | null => {
      const courierService = isRecord(rate?.courier_service) ? (rate.courier_service as Record<string, unknown>) : null;
      const courierRecord =
        courierService && isRecord(courierService.courier) ? (courierService.courier as Record<string, unknown>) : null;
      const fullDescription = trimOrNull(rate?.full_description);
      const description = trimOrNull(rate?.description);

      const idCandidate =
        trimOrNull(courierService?.id) ||
        firstText(rate, [
          'courier_service_id',
          'rate_id',
          'id',
          'courier_id',
          'courier_service.id',
          'courier.id',
          'service.id',
        ]) ||
        trimOrNull(deepFindByKeys(rate, ['courier_service_id', 'rate_id', 'id', 'service_id']) || null);
      const carrierCandidate =
        trimOrNull(courierService?.courier_name) ||
        trimOrNull(courierRecord?.name) ||
        trimOrNull(courierRecord?.display_name) ||
        carrierFromFullDescription(fullDescription) ||
        firstText(rate, [
          'courier_name',
          'carrier',
          'provider',
          'courier.name',
          'courier.display_name',
          'courier.company_name',
          'service.courier_name',
          'service.provider',
        ]) ||
        trimOrNull(deepFindByKeys(rate, ['courier_name', 'carrier', 'provider']) || null);
      const serviceCandidate =
        trimOrNull(courierService?.service_name) ||
        trimOrNull(courierService?.name) ||
        description ||
        fullDescription ||
        firstText(rate, [
          'service_name',
          'service_level_name',
          'service',
          'courier_service_name',
          'courier_service.name',
          'service.name',
          'shipping_service_name',
          'shipping_service',
        ]) ||
        trimOrNull(deepFindByKeys(rate, ['service_name', 'service_level_name', 'service']) || null);
      const amountCandidate =
        firstAmountCents(rate, [
          'total_charge',
          'shipping_rate',
          'rate',
          'amount',
          'total_charge.amount',
          'shipment_charge.total',
          'shipment_charge.amount',
          'shipping_total',
          'total',
        ]) ??
        toAmountCents(deepFindByKeys(rate, ['total_charge', 'shipping_rate', 'rate', 'amount', 'total'])) ??
        null;
      const currency =
        firstText(rate, [
          'currency',
          'currency_code',
          'total_charge_currency',
          'total_charge.currency',
          'shipment_charge.currency',
        ]) || 'USD';
      const etaDaysMin =
        firstNumber(rate, ['delivery_days_min', 'estimated_delivery_days_min', 'delivery.eta_min']) ?? null;
      const etaDaysMax =
        firstNumber(rate, ['delivery_days_max', 'estimated_delivery_days_max', 'delivery.eta_max']) ?? null;

      const fallbackIdBase = `${carrierCandidate || 'UNKNOWN'}|${serviceCandidate || 'UNKNOWN'}|${amountCandidate ?? 0}`;
      const id = idCandidate || `easyship-rate-${stableHash(fallbackIdBase)}-${index + 1}`;
      const carrier = carrierCandidate || 'UNKNOWN';
      const service = serviceCandidate || carrier;
      const amountCents = amountCandidate ?? 0;
      return {
        id,
        carrier,
        service,
        amountCents,
        currency: currency.toUpperCase(),
        etaDaysMin,
        etaDaysMax,
        raw: rate,
      };
    })
    .filter((rate): rate is EasyshipRate => !!rate);

  return normalized;
};

const normalizeShipmentSnapshot = (payload: any): EasyshipShipmentSnapshot => {
  const shipment = payload?.shipment || payload?.data?.shipment || payload?.data || payload || {};
  const label = shipment?.label || shipment?.shipping_label || payload?.label || payload?.data?.label || {};
  const selectedRate =
    shipment?.selected_rate ||
    shipment?.courier ||
    shipment?.selected_courier ||
    payload?.selected_rate ||
    {};
  const statusRaw =
    maybeText(label?.status) ||
    maybeText(shipment?.label_state) ||
    maybeText(shipment?.status) ||
    maybeText(payload?.status) ||
    '';
  const status = statusRaw.toLowerCase();

  const shipmentId =
    trimOrNull(shipment?.id) ||
    trimOrNull(shipment?.shipment_id) ||
    trimOrNull(payload?.shipment_id) ||
    '';
  const labelId =
    trimOrNull(label?.id) ||
    trimOrNull(shipment?.label_id) ||
    trimOrNull(payload?.label_id) ||
    null;
  const carrier =
    trimOrNull(selectedRate?.carrier) ||
    trimOrNull(selectedRate?.courier_name) ||
    trimOrNull(shipment?.carrier) ||
    null;
  const service =
    trimOrNull(selectedRate?.service) ||
    trimOrNull(selectedRate?.service_name) ||
    trimOrNull(shipment?.service) ||
    null;
  const trackingNumber =
    trimOrNull(label?.tracking_number) ||
    trimOrNull(shipment?.tracking_number) ||
    trimOrNull(payload?.tracking_number) ||
    null;
  const labelUrl =
    trimOrNull(label?.label_url) ||
    trimOrNull(label?.download_url) ||
    trimOrNull(shipment?.label_url) ||
    trimOrNull(payload?.label_url) ||
    null;
  const labelCostAmountCents =
    toAmountCents(label?.cost) ??
    toAmountCents(label?.price) ??
    toAmountCents(selectedRate?.total_charge) ??
    toAmountCents(shipment?.shipping_cost) ??
    null;
  const labelCurrency =
    trimOrNull(label?.currency) ||
    trimOrNull(selectedRate?.currency) ||
    trimOrNull(payload?.currency) ||
    'USD';

  let labelState: 'pending' | 'generated' | 'failed' = 'pending';
  if (labelUrl) {
    labelState = 'generated';
  } else if (status.includes('fail') || status.includes('error') || status.includes('cancel')) {
    labelState = 'failed';
  } else if (status.includes('label_generated') || status.includes('generated') || status.includes('success')) {
    labelState = 'generated';
  }

  return {
    shipmentId,
    labelId,
    carrier,
    service,
    trackingNumber,
    labelUrl,
    labelCostAmountCents,
    labelCurrency: labelCurrency.toUpperCase(),
    labelState,
    raw: payload,
  };
};

const maybeMock = (env: EasyshipEnv) => env.EASYSHIP_MOCK === '1';

const buildMockRates = (input: EasyshipRateRequest): EasyshipRate[] => {
  const volume = input.dimensions.lengthIn * input.dimensions.widthIn * input.dimensions.heightIn;
  const base = Math.max(6.5, input.dimensions.weightLb * 4 + volume * 0.0035);
  const sample = [
    { id: 'mock-usps-priority', carrier: 'USPS', service: 'Priority Mail', add: 0, etaMin: 2, etaMax: 4 },
    { id: 'mock-ups-ground', carrier: 'UPS', service: 'Ground', add: 1.1, etaMin: 2, etaMax: 5 },
    { id: 'mock-fedex-ground', carrier: 'FedEx', service: 'Ground Home', add: 1.45, etaMin: 2, etaMax: 5 },
  ];
  return sample.map((entry) => ({
    id: entry.id,
    carrier: entry.carrier,
    service: entry.service,
    amountCents: Math.round((base + entry.add) * 100),
    currency: 'USD',
    etaDaysMin: entry.etaMin,
    etaDaysMax: entry.etaMax,
    raw: entry,
  }));
};

const buildMockShipmentSnapshot = (request: EasyshipCreateShipmentRequest): EasyshipShipmentSnapshot => {
  const trackingSeed = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const trackingNumber = `MOCK${trackingSeed.slice(-12)}`;
  const rateId = request.courierServiceId || 'mock-rate';
  const carrier = rateId.toUpperCase().includes('USPS')
    ? 'USPS'
    : rateId.toUpperCase().includes('FEDEX')
    ? 'FedEx'
    : 'UPS';
  const service = rateId;
  const costBase = Math.max(5.99, request.dimensions.weightLb * 4.25);
  const cents = Math.round(costBase * 100);

  return {
    shipmentId: crypto.randomUUID(),
    labelId: crypto.randomUUID(),
    carrier,
    service,
    trackingNumber,
    labelUrl: `https://example.com/mock-labels/${crypto.randomUUID()}.pdf`,
    labelCostAmountCents: cents,
    labelCurrency: 'USD',
    labelState: 'generated',
    raw: {
      mock: true,
      requestedAt: toIsoNoMs(new Date()),
      request,
    },
  };
};

const requestEasyshipDetailed = async <T>(
  env: EasyshipEnv,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  options?: { throwOnHttpError?: boolean }
): Promise<EasyshipDebugRequestResult & { data: T }> => {
  const token = trimOrNull(env.EASYSHIP_TOKEN);
  if (!token) {
    throw new Error('EASYSHIP_TOKEN is not configured');
  }
  const baseUrl = normalizeBaseUrl(env.EASYSHIP_API_BASE_URL);
  const finalPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${finalPath}`;
  let endpoint = { host: 'unknown', path: finalPath };
  try {
    const parsed = new URL(url);
    endpoint = {
      host: parsed.host,
      path: parsed.pathname,
    };
  } catch {}
  if (isEasyshipDebugEnabled(env)) {
    const tokenLength = token.length;
    const payloadShape = summarizeEasyshipPayloadShape(body);
    console.log('[easyship][debug] outgoing request shape', {
      method,
      endpoint,
      envPresent: {
        EASYSHIP_API_BASE_URL: !!trimOrNull(env.EASYSHIP_API_BASE_URL),
        EASYSHIP_TOKEN: !!token,
        EASYSHIP_ALLOWED_CARRIERS: !!trimOrNull(env.EASYSHIP_ALLOWED_CARRIERS),
      },
      tokenLength,
      bodyTopLevelKeys: payloadShape.topLevelKeys,
      hasShipmentWrapper: payloadShape.hasShipmentWrapper,
      shipmentWrapperKeys: payloadShape.shipmentWrapperKeys,
      parcelSource: payloadShape.parcelSource,
      parcelsCount: payloadShape.parcelsCount,
      firstParcelKeys: payloadShape.firstParcelKeys,
      firstParcelItemsIsArray: payloadShape.firstParcelItemsIsArray,
      firstParcelItemsLength: payloadShape.firstParcelItemsLength,
      firstParcelFirstItemKeys: payloadShape.firstParcelFirstItemKeys,
      firstParcelFirstItemHasCategory: payloadShape.firstParcelFirstItemHasCategory,
      bodySkeleton: payloadShape.skeleton,
    });
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const contentType = trimOrNull(response.headers.get('content-type'));
  const warning = getResponseWarning(data);
  const message = getResponseMessage(data);
  const hasError = getResponseHasErrorShape(data);
  const errorCode = getResponseErrorCode(data);
  const responseTopKeys = getResponseTopKeys(data);
  const ratesLength = getRatesArrayLengthHint(data);
  const errorDetailsLength = getResponseErrorDetailsLength(data);

  if (isEasyshipDebugEnabled(env)) {
    console.log('[easyship][debug] response summary', {
      method,
      endpoint,
      status: response.status,
      contentType,
      responseTopKeys,
      warning: truncateText(warning),
      message: truncateText(message),
      hasError,
      errorCode,
      errorDetailsLength,
      ratesLength,
    });
  }

  if (!response.ok && options?.throwOnHttpError !== false) {
    const detail = warning || text || 'Easyship request failed';
    throw new EasyshipHttpError({
      message: `Easyship ${method} ${finalPath} failed (${response.status}): ${detail}`,
      status: response.status,
      endpoint,
      warning,
      errorCode,
      hasError: true,
    });
  }
  return {
    ok: response.ok,
    status: response.status,
    endpoint,
    contentType,
    responseTopKeys,
    warning,
    message,
    hasError,
    errorCode,
    ratesLength,
    data: (data ?? {}) as T,
  };
};

const requestEasyship = async <T>(
  env: EasyshipEnv,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<T> => {
  const result = await requestEasyshipDetailed<T>(env, path, method, body);
  return result.data;
};

export const requestEasyshipDebug = async (
  env: EasyshipEnv,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<EasyshipDebugRequestResult> => {
  const result = await requestEasyshipDetailed<any>(env, path, method, body, { throwOnHttpError: false });
  return {
    ok: result.ok,
    status: result.status,
    endpoint: result.endpoint,
    contentType: result.contentType,
    responseTopKeys: result.responseTopKeys,
    warning: result.warning,
    message: result.message,
    hasError: result.hasError,
    errorCode: result.errorCode,
    ratesLength: result.ratesLength,
    data: result.data,
  };
};

const normalizeCarrierLetters = (value: string): string => value.toUpperCase().replace(/[^A-Z]/g, '');

const canonicalCarrierAlias = (normalized: string): string | null => {
  if (!normalized) return null;
  if (normalized.includes('FEDERALEXPRESS')) return 'FEDEX';
  if (normalized.includes('UNITEDPARCELSERVICE')) return 'UPS';
  if (normalized.includes('USPOSTALSERVICE')) return 'USPS';
  return null;
};

const getCarrierMatchTokens = (value: string): string[] => {
  const normalized = normalizeCarrierLetters(value);
  if (!normalized) return [];
  const tokens = new Set<string>([normalized]);
  const alias = canonicalCarrierAlias(normalized);
  if (alias) tokens.add(alias);
  return Array.from(tokens);
};

export const getAllowedCarriers = (env: EasyshipEnv): string[] => parseAllowedCarriers(env.EASYSHIP_ALLOWED_CARRIERS);

export const filterAllowedRates = (rates: EasyshipRate[], allowedCarriers: string[]): EasyshipRate[] => {
  if (!allowedCarriers.length) return rates;
  const allowedTokens = allowedCarriers
    .flatMap((carrier) => getCarrierMatchTokens(carrier))
    .filter(Boolean);
  if (!allowedTokens.length) return rates;

  return rates.filter((rate) => {
    const carrierTokens = getCarrierMatchTokens(rate.carrier);
    return carrierTokens.some((carrierToken) =>
      allowedTokens.some(
        (allowedToken) => carrierToken.includes(allowedToken) || allowedToken.includes(carrierToken)
      )
    );
  });
};

export const pickCheapestRate = (rates: EasyshipRate[]): EasyshipRate | null => {
  if (!rates.length) return null;
  return [...rates].sort((a, b) => a.amountCents - b.amountCents)[0];
};

const toNonEmptyRateItems = (items: EasyshipRateRequest['items']): EasyshipRateItem[] => {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item): EasyshipRateItem | null => {
      if (!item || typeof item !== 'object') return null;
      const description = trimOrNull(item.description) || 'Order item';
      const quantityRaw = Number(item.quantity);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
      const valueRaw = Number(item.declaredValueCents);
      const declaredValueCents = Number.isFinite(valueRaw) && valueRaw >= 0 ? Math.round(valueRaw) : 1;
      return { description, quantity, declaredValueCents };
    })
    .filter((item): item is EasyshipRateItem => !!item);
  if (normalized.length) return normalized;
  return [{ description: 'Order items', quantity: 1, declaredValueCents: 1 }];
};

export const buildEasyshipRatesPayload = (input: EasyshipRateRequest) => {
  const originCountry = (trimOrNull(input.origin.countryCode) || 'US').toUpperCase();
  const destinationCountry = (trimOrNull(input.destination.countryCode) || 'US').toUpperCase();
  const isDomesticUS = originCountry === 'US' && destinationCountry === 'US';
  const destinationCity = (trimOrNull(input.destination.city) || '').trim();
  const destinationState = (trimOrNull(input.destination.state) || '').trim();
  const items = toNonEmptyRateItems(input.items);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const safeTotalQuantity = totalQuantity > 0 ? totalQuantity : 1;
  const totalWeightKg = Number(poundsToKg(input.dimensions.weightLb).toFixed(4));
  const perItemWeight = Number((totalWeightKg / safeTotalQuantity).toFixed(4));
  const safePerItemWeight = perItemWeight > 0 ? perItemWeight : 0.001;

  return {
    origin_address: {
      contact_name: input.origin.name,
      company_name: trimOrNull(input.origin.companyName) || undefined,
      contact_email: trimOrNull(input.origin.email) || undefined,
      contact_phone: trimOrNull(input.origin.phone) || undefined,
      line_1: input.origin.addressLine1,
      line_2: trimOrNull(input.origin.addressLine2) || undefined,
      city: input.origin.city,
      state: input.origin.state,
      postal_code: input.origin.postalCode,
      country_alpha2: originCountry,
    },
    destination_address: {
      contact_name: input.destination.name,
      company_name: trimOrNull(input.destination.companyName) || undefined,
      contact_email: trimOrNull(input.destination.email) || undefined,
      contact_phone: trimOrNull(input.destination.phone) || undefined,
      line_1: input.destination.addressLine1,
      line_2: trimOrNull(input.destination.addressLine2) || undefined,
      city: destinationCity,
      state: destinationState,
      postal_code: input.destination.postalCode,
      country_alpha2: destinationCountry,
    },
    shipping_settings: {
      units: {
        weight: 'kg',
        dimensions: 'cm',
      },
    },
    parcels: [
      {
        box: {
          length: Number(inchesToCm(input.dimensions.lengthIn).toFixed(2)),
          width: Number(inchesToCm(input.dimensions.widthIn).toFixed(2)),
          height: Number(inchesToCm(input.dimensions.heightIn).toFixed(2)),
        },
        total_actual_weight: Number(totalWeightKg.toFixed(3)),
        items: items.map((item) => {
          const baseDeclaredValueCents = Math.round(Number(item.declaredValueCents ?? 1));
          const safeDeclaredValueCents = isDomesticUS
            ? Math.max(1, Number.isFinite(baseDeclaredValueCents) ? baseDeclaredValueCents : 1)
            : Math.max(0, Number.isFinite(baseDeclaredValueCents) ? baseDeclaredValueCents : 1);
          return {
            description: item.description,
            category: DEFAULT_EASYSHIP_ITEM_CATEGORY,
            quantity: item.quantity,
            actual_weight: safePerItemWeight,
            declared_currency: 'USD',
            declared_customs_value: Number((safeDeclaredValueCents / 100).toFixed(2)),
          };
        }),
      },
    ],
  };
};

const buildShipmentPayload = (input: EasyshipCreateShipmentRequest) => ({
  shipment: {
    origin_address: {
      name: input.origin.name,
      company_name: input.origin.companyName ?? undefined,
      email: input.origin.email ?? undefined,
      phone_number: input.origin.phone ?? undefined,
      address_line_1: input.origin.addressLine1,
      address_line_2: input.origin.addressLine2 ?? undefined,
      city: input.origin.city,
      state: input.origin.state,
      postal_code: input.origin.postalCode,
      country_alpha2: input.origin.countryCode,
    },
    destination_address: {
      name: input.destination.name,
      company_name: input.destination.companyName ?? undefined,
      email: input.destination.email ?? undefined,
      phone_number: input.destination.phone ?? undefined,
      address_line_1: input.destination.addressLine1,
      address_line_2: input.destination.addressLine2 ?? undefined,
      city: input.destination.city,
      state: input.destination.state,
      postal_code: input.destination.postalCode,
      country_alpha2: input.destination.countryCode,
    },
    parcels: [
      {
        box: {
          length: Number(input.dimensions.lengthIn.toFixed(2)),
          width: Number(input.dimensions.widthIn.toFixed(2)),
          height: Number(input.dimensions.heightIn.toFixed(2)),
          unit: 'in',
        },
        item: {
          actual_weight: Number(input.dimensions.weightLb.toFixed(3)),
          weight_unit: 'lb',
        },
      },
    ],
    courier_service_id: input.courierServiceId,
    external_reference: input.externalReference ?? undefined,
  },
});

export async function fetchEasyshipRates(env: EasyshipEnv, input: EasyshipRateRequest): Promise<EasyshipRatesResult> {
  if (maybeMock(env)) {
    return {
      rates: buildMockRates(input),
      warning: null,
    };
  }
  const payload = buildEasyshipRatesPayload(input);
  const debugEnabled = isEasyshipDebugEnabled(env);
  if (isEasyshipDebugEnabled(env)) {
    const metrics = summarizeRateMetricsForDebug(input, payload);
    const firstParcel = Array.isArray(payload.parcels) ? payload.parcels[0] : null;
    const firstItems =
      firstParcel && typeof firstParcel === 'object' && Array.isArray((firstParcel as any).items)
        ? ((firstParcel as any).items as Array<Record<string, unknown>>)
        : [];
    console.log('[easyship][debug] rates request metrics', metrics);
    console.log('[easyship][debug] rates item/value checks', {
      destinationHasCity: !!trimOrNull(payload.destination_address?.city),
      destinationHasState: !!trimOrNull(payload.destination_address?.state),
      itemCategoryPresent: !!trimOrNull(firstItems[0]?.category),
      itemCategoryLength: trimOrNull(firstItems[0]?.category)?.length || 0,
      declaredCustomsValues: firstItems.slice(0, 5).map((item) => Number(item.declared_customs_value ?? 0)),
    });
  }
  try {
    const response = await requestEasyshipDetailed<any>(env, '/rates', 'POST', payload);
    const rawRates = extractRawRatesArray(response.data);
    if (debugEnabled) {
      const firstRawCourierService =
        rawRates[0] && typeof rawRates[0] === 'object' && !Array.isArray(rawRates[0])
          ? ((rawRates[0] as Record<string, unknown>).courier_service as unknown)
          : null;
      console.log('[easyship][debug] rates raw parse snapshot', {
        rawRatesLength: rawRates.length,
        rawFirstRateKeys:
          rawRates[0] && typeof rawRates[0] === 'object' && !Array.isArray(rawRates[0])
            ? Object.keys(rawRates[0] as Record<string, unknown>)
            : [],
        rawCourierServiceKeys:
          firstRawCourierService &&
          typeof firstRawCourierService === 'object' &&
          !Array.isArray(firstRawCourierService)
            ? Object.keys(firstRawCourierService as Record<string, unknown>)
            : [],
      });
    }
    const rates = parseRatesFromResponse(response.data);
    if (debugEnabled) {
      console.log('[easyship][debug] rates normalized snapshot', {
        returnedRatesLength: rates.length,
        returnedFirstRateKeys:
          rates[0] && typeof rates[0] === 'object' && !Array.isArray(rates[0])
            ? Object.keys(rates[0] as Record<string, unknown>)
            : [],
        extractedCarrierServiceSample: rates.slice(0, 5).map((rate) => ({
          carrier: rate.carrier,
          service: rate.service,
        })),
      });
    }
    const warning = getResponseWarning(response.data);
    const hasError = response.hasError;
    if (hasError && !rates.length && debugEnabled) {
      console.log('[easyship][debug] rates response was error-shaped with 200/ok status', {
        status: response.status,
        errorCode: response.errorCode,
      });
    }
    return {
      rates,
      warning,
      rawResponseHints: debugEnabled
        ? {
            status: response.status,
            hasError,
            errorCode: response.errorCode || null,
          }
        : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (error instanceof EasyshipHttpError && lower.includes(NO_SHIPPING_SOLUTIONS_DETAIL.toLowerCase())) {
      if (debugEnabled) {
        console.log('[easyship][debug] rates returned no shipping solutions', {
          status: error.status,
          errorCode: error.errorCode || null,
        });
      }
      return {
        rates: [],
        warning: error.warning || NO_SHIPPING_SOLUTIONS_DETAIL,
        rawResponseHints: debugEnabled
          ? {
              status: error.status,
              hasError: error.hasError,
              errorCode: error.errorCode || null,
            }
          : undefined,
      };
    }
    if (message.toLowerCase().includes(NO_SHIPPING_SOLUTIONS_DETAIL.toLowerCase())) {
      if (debugEnabled) {
        console.log('[easyship][debug] rates returned no shipping solutions');
      }
      return {
        rates: [],
        warning: NO_SHIPPING_SOLUTIONS_DETAIL,
        rawResponseHints: debugEnabled
          ? {
              status: 0,
              hasError: true,
            }
          : undefined,
      };
    }
    throw error;
  }
}

export async function createShipmentAndBuyLabel(
  env: EasyshipEnv,
  input: EasyshipCreateShipmentRequest
): Promise<EasyshipShipmentSnapshot> {
  if (maybeMock(env)) {
    return buildMockShipmentSnapshot(input);
  }

  const payload = buildShipmentPayload(input);
  const payloadShape = summarizeEasyshipPayloadShape(payload);
  const invalidDimensionsReason: string[] = [];
  if (!Number.isFinite(input.dimensions.lengthIn) || input.dimensions.lengthIn <= 0) invalidDimensionsReason.push('lengthIn');
  if (!Number.isFinite(input.dimensions.widthIn) || input.dimensions.widthIn <= 0) invalidDimensionsReason.push('widthIn');
  if (!Number.isFinite(input.dimensions.heightIn) || input.dimensions.heightIn <= 0) invalidDimensionsReason.push('heightIn');
  if (!Number.isFinite(input.dimensions.weightLb) || input.dimensions.weightLb <= 0) invalidDimensionsReason.push('weightLb');

  if (isEasyshipDebugEnabled(env)) {
    const [orderId, shipmentId] = (input.externalReference || '').split(':');
    console.log('[easyship][debug] create shipment preflight', {
      orderId: orderId || null,
      shipmentId: shipmentId || null,
      courierServiceIdPresent: !!trimOrNull(input.courierServiceId),
      dimensions: {
        lengthIn: Number(input.dimensions.lengthIn.toFixed(2)),
        widthIn: Number(input.dimensions.widthIn.toFixed(2)),
        heightIn: Number(input.dimensions.heightIn.toFixed(2)),
        weightLb: Number(input.dimensions.weightLb.toFixed(3)),
      },
      parcelsCount: payloadShape.parcelsCount,
      firstParcelKeys: payloadShape.firstParcelKeys,
      firstParcelItemsLength: payloadShape.firstParcelItemsLength,
      zeroParcelsReason: payloadShape.parcelsCount === 0 ? (invalidDimensionsReason.length ? invalidDimensionsReason : ['unknown']) : [],
    });
  }

  if (payloadShape.parcelsCount === 0) {
    throw new Error(
      invalidDimensionsReason.length
        ? `Shipment payload has zero parcels due to invalid dimensions/weight: ${invalidDimensionsReason.join(', ')}`
        : 'Shipment payload has zero parcels'
    );
  }
  const created = await requestEasyship<any>(env, '/shipments', 'POST', payload);
  const createSnapshot = normalizeShipmentSnapshot(created);
  const shipmentId = createSnapshot.shipmentId;
  if (!shipmentId) {
    throw new Error('Easyship create shipment response missing shipment id');
  }

  const purchaseCandidates = [
    `/shipments/${encodeURIComponent(shipmentId)}/purchase`,
    `/shipments/${encodeURIComponent(shipmentId)}/buy`,
    `/shipments/${encodeURIComponent(shipmentId)}/label`,
  ];

  let purchasedData: any = null;
  let lastError: Error | null = null;
  for (const path of purchaseCandidates) {
    try {
      purchasedData = await requestEasyship<any>(env, path, 'POST', {
        courier_service_id: input.courierServiceId,
      });
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (!purchasedData) {
    throw lastError || new Error('Easyship purchase label request failed');
  }

  return normalizeShipmentSnapshot(purchasedData);
}

export async function getEasyshipShipment(env: EasyshipEnv, shipmentId: string): Promise<EasyshipShipmentSnapshot> {
  if (maybeMock(env)) {
    return {
      shipmentId,
      labelId: crypto.randomUUID(),
      carrier: 'USPS',
      service: 'Priority Mail',
      trackingNumber: `MOCK${Date.now()}`,
      labelUrl: `https://example.com/mock-labels/${shipmentId}.pdf`,
      labelCostAmountCents: 799,
      labelCurrency: 'USD',
      labelState: 'generated',
      raw: { mock: true },
    };
  }
  const data = await requestEasyship<any>(env, `/shipments/${encodeURIComponent(shipmentId)}`, 'GET');
  return normalizeShipmentSnapshot(data);
}

export const normalizeRateForClient = (rate: EasyshipRate) => ({
  id: rate.id,
  carrier: rate.carrier,
  service: rate.service,
  amountCents: rate.amountCents,
  currency: rate.currency,
  etaDaysMin: rate.etaDaysMin,
  etaDaysMax: rate.etaDaysMax,
});

export const buildRateCacheSignaturePayload = (payload: {
  orderId: string;
  destination: EasyshipAddressInput;
  dimensions: EasyshipRateRequest['dimensions'];
  allowedCarriers: string[];
}) =>
  JSON.stringify({
    orderId: payload.orderId,
    destination: {
      postalCode: payload.destination.postalCode,
      countryCode: payload.destination.countryCode,
      state: payload.destination.state,
      city: payload.destination.city,
    },
    dimensions: payload.dimensions,
    allowedCarriers: payload.allowedCarriers.map((c) => toSlug(c)).sort(),
  });
