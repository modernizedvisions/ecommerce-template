type EasyshipEnv = {
  EASYSHIP_TOKEN?: string;
  EASYSHIP_API_BASE_URL?: string;
  EASYSHIP_ALLOWED_CARRIERS?: string;
  EASYSHIP_MOCK?: string;
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
};

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

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toIsoNoMs = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

const normalizeBaseUrl = (value: string | undefined): string => {
  const fallback = 'https://api.easyship.com';
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

const normalizeCarrierKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const getAllowedCarriers = (env: EasyshipEnv): string[] => parseAllowedCarriers(env.EASYSHIP_ALLOWED_CARRIERS);

export const filterAllowedRates = (rates: EasyshipRate[], allowedCarriers: string[]): EasyshipRate[] => {
  if (!allowedCarriers.length) return rates;
  const allowedKeys = new Set(allowedCarriers.map(normalizeCarrierKey));
  return rates.filter((rate) => allowedKeys.has(normalizeCarrierKey(rate.carrier)));
};

export const pickCheapestRate = (rates: EasyshipRate[]): EasyshipRate | null => {
  if (!rates.length) return null;
  return [...rates].sort((a, b) => a.amountCents - b.amountCents)[0];
};

const buildRatesPayload = (input: EasyshipRateRequest) => ({
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
  },
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
  const payload = buildRatesPayload(input);
  const data = await requestEasyship<any>(env, '/rates', 'POST', payload);
  return parseRatesFromResponse(data);
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

