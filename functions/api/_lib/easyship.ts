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
  const parcels = isObjectRecord(payload) && Array.isArray(payload.parcels) ? payload.parcels : [];
  const firstParcel = parcels[0];
  const firstParcelKeys = objectKeys(firstParcel);
  const firstParcelItems =
    isObjectRecord(firstParcel) && Array.isArray(firstParcel.items) ? firstParcel.items : null;
  const firstParcelFirstItem = Array.isArray(firstParcelItems) ? firstParcelItems[0] : undefined;
  const firstParcelFirstItemKeys = objectKeys(firstParcelFirstItem);
  return {
    topLevelKeys,
    hasShipmentWrapper: topLevelKeys.includes('shipment'),
    shipmentWrapperKeys: shipmentKeys,
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
  const fallback = ['USPS', 'UPS', 'FEDEX'];
  if (!value || !value.trim()) return fallback;
  const parsed = value
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length ? Array.from(new Set(parsed)) : fallback;
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

const parseRatesFromResponse = (data: any): EasyshipRate[] => {
  const source: any[] = Array.isArray(data?.rates)
    ? data.rates
    : Array.isArray(data?.couriers)
    ? data.couriers
    : Array.isArray(data?.data?.rates)
    ? data.data.rates
    : Array.isArray(data?.data?.couriers)
    ? data.data.couriers
    : [];

  const normalized = source
    .map((rate: any): EasyshipRate | null => {
      const id =
        trimOrNull(rate?.courier_service_id) ||
        trimOrNull(rate?.rate_id) ||
        trimOrNull(rate?.id) ||
        null;
      const carrier =
        trimOrNull(rate?.courier_name) ||
        trimOrNull(rate?.carrier) ||
        trimOrNull(rate?.provider) ||
        null;
      const service =
        trimOrNull(rate?.service_name) ||
        trimOrNull(rate?.service_level_name) ||
        trimOrNull(rate?.service) ||
        null;
      const amountCents =
        toAmountCents(rate?.total_charge) ??
        toAmountCents(rate?.shipping_rate) ??
        toAmountCents(rate?.rate) ??
        toAmountCents(rate?.amount) ??
        null;
      const currency =
        trimOrNull(rate?.currency) ||
        trimOrNull(rate?.currency_code) ||
        trimOrNull(rate?.total_charge_currency) ||
        'USD';
      const etaDaysMin =
        toFiniteNumberOrNull(rate?.delivery_days_min) ??
        toFiniteNumberOrNull(rate?.estimated_delivery_days_min) ??
        null;
      const etaDaysMax =
        toFiniteNumberOrNull(rate?.delivery_days_max) ??
        toFiniteNumberOrNull(rate?.estimated_delivery_days_max) ??
        null;

      if (!id || !carrier || !service || amountCents === null) return null;
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

const requestEasyship = async <T>(
  env: EasyshipEnv,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<T> => {
  const token = trimOrNull(env.EASYSHIP_TOKEN);
  if (!token) {
    throw new Error('EASYSHIP_TOKEN is not configured');
  }
  const baseUrl = normalizeBaseUrl(env.EASYSHIP_API_BASE_URL);
  const finalPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${finalPath}`;
  if (isEasyshipDebugEnabled(env)) {
    const tokenLength = token.length;
    const payloadShape = summarizeEasyshipPayloadShape(body);
    let host = 'unknown';
    let pathname = finalPath;
    try {
      const parsed = new URL(url);
      host = parsed.host;
      pathname = parsed.pathname;
    } catch {}
    console.log('[easyship][debug] outgoing request shape', {
      method,
      endpoint: {
        host,
        path: pathname,
      },
      envPresent: {
        EASYSHIP_API_BASE_URL: !!trimOrNull(env.EASYSHIP_API_BASE_URL),
        EASYSHIP_TOKEN: !!token,
        EASYSHIP_ALLOWED_CARRIERS: !!trimOrNull(env.EASYSHIP_ALLOWED_CARRIERS),
      },
      tokenLength,
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
  if (!response.ok) {
    const detail =
      trimOrNull(data?.message) ||
      trimOrNull(data?.error) ||
      trimOrNull(data?.detail) ||
      text ||
      'Easyship request failed';
    throw new Error(`Easyship ${method} ${finalPath} failed (${response.status}): ${detail}`);
  }
  return (data ?? {}) as T;
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

export const buildEasyshipRatesPayload = (input: EasyshipRateRequest) => ({
  origin_address: {
    contact_name: input.origin.name,
    company_name: input.origin.companyName ?? undefined,
    contact_email: input.origin.email ?? undefined,
    contact_phone: input.origin.phone ?? undefined,
    line_1: input.origin.addressLine1,
    line_2: input.origin.addressLine2 ?? undefined,
    city: input.origin.city,
    state: input.origin.state,
    postal_code: input.origin.postalCode,
    country_alpha2: input.origin.countryCode,
  },
  destination_address: {
    contact_name: input.destination.name,
    company_name: input.destination.companyName ?? undefined,
    contact_email: input.destination.email ?? undefined,
    contact_phone: input.destination.phone ?? undefined,
    line_1: input.destination.addressLine1,
    line_2: input.destination.addressLine2 ?? undefined,
    city: input.destination.city,
    state: input.destination.state,
    postal_code: input.destination.postalCode,
    country_alpha2: input.destination.countryCode,
  },
  shipping_settings: {
    units: {
      weight: 'kg',
      dimensions: 'cm',
    },
  },
  parcels: (() => {
    const items = toNonEmptyRateItems(input.items);
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const safeTotalQuantity = totalQuantity > 0 ? totalQuantity : 1;
    const totalWeightKg = Number(poundsToKg(input.dimensions.weightLb).toFixed(4));
    const perItemWeight = Number((totalWeightKg / safeTotalQuantity).toFixed(4));
    const safePerItemWeight = perItemWeight > 0 ? perItemWeight : 0.001;
    return [
      {
        box: {
          length: Number(inchesToCm(input.dimensions.lengthIn).toFixed(2)),
          width: Number(inchesToCm(input.dimensions.widthIn).toFixed(2)),
          height: Number(inchesToCm(input.dimensions.heightIn).toFixed(2)),
        },
        total_actual_weight: Number(totalWeightKg.toFixed(3)),
        items: items.map((item) => ({
          description: item.description,
          category: DEFAULT_EASYSHIP_ITEM_CATEGORY,
          quantity: item.quantity,
          actual_weight: safePerItemWeight,
          declared_currency: 'USD',
          declared_customs_value: Number(((item.declaredValueCents ?? 1) / 100).toFixed(2)),
        })),
      },
    ];
  })(),
});

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
    selected_courier_id: input.courierServiceId,
    external_reference: input.externalReference ?? undefined,
  },
});

export async function fetchEasyshipRates(env: EasyshipEnv, input: EasyshipRateRequest): Promise<EasyshipRate[]> {
  if (maybeMock(env)) {
    return buildMockRates(input);
  }
  const payload = buildEasyshipRatesPayload(input);
  if (isEasyshipDebugEnabled(env)) {
    const metrics = summarizeRateMetricsForDebug(input, payload);
    console.log('[easyship][debug] rates request metrics', metrics);
  }
  try {
    const data = await requestEasyship<any>(env, '/rates', 'POST', payload);
    return parseRatesFromResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes(NO_SHIPPING_SOLUTIONS_DETAIL.toLowerCase())) {
      if (isEasyshipDebugEnabled(env)) {
        console.log('[easyship][debug] rates returned no shipping solutions');
      }
      return [];
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
