import { adminFetch } from './adminAuth';

export type ShipFromSettings = {
  shipFromName: string;
  shipFromAddress1: string;
  shipFromAddress2: string;
  shipFromCity: string;
  shipFromState: string;
  shipFromPostal: string;
  shipFromCountry: string;
  shipFromPhone: string;
  updatedAt: string | null;
};

export type ShippingBoxPreset = {
  id: string;
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  defaultWeightLb: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrderShipment = {
  id: string;
  orderId: string;
  parcelIndex: number;
  boxPresetId: string | null;
  boxPresetName: string | null;
  customLengthIn: number | null;
  customWidthIn: number | null;
  customHeightIn: number | null;
  weightLb: number;
  easyshipShipmentId: string | null;
  easyshipLabelId: string | null;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  labelCostAmountCents: number | null;
  labelCurrency: string;
  labelState: 'pending' | 'generated' | 'failed';
  quoteSelectedId: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  purchasedAt: string | null;
  updatedAt: string | null;
  effectiveLengthIn: number | null;
  effectiveWidthIn: number | null;
  effectiveHeightIn: number | null;
};

export type ShipmentQuote = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  etaDaysMin: number | null;
  etaDaysMax: number | null;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!data) throw new Error('Response was not valid JSON');
  return data;
};

const failWithResponse = async (response: Response, fallback: string): Promise<never> => {
  const data = (await response.json().catch(() => null)) as any;
  const detail = data?.detail || data?.error || data?.code || '';
  throw new Error(`${fallback} (${response.status})${detail ? `: ${detail}` : ''}`);
};

export async function adminFetchShippingSettings(): Promise<{
  shipFrom: ShipFromSettings;
  boxPresets: ShippingBoxPreset[];
}> {
  const response = await adminFetch('/api/admin/settings/shipping', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return failWithResponse(response, 'Failed to fetch shipping settings');
  const data = await parseJson<any>(response);
  return {
    shipFrom: data.shipFrom as ShipFromSettings,
    boxPresets: Array.isArray(data.boxPresets) ? (data.boxPresets as ShippingBoxPreset[]) : [],
  };
}

export async function adminUpdateShipFrom(payload: Partial<ShipFromSettings>): Promise<ShipFromSettings> {
  const response = await adminFetch('/api/admin/settings/shipping/ship-from', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failWithResponse(response, 'Failed to save ship-from settings');
  const data = await parseJson<any>(response);
  return data.shipFrom as ShipFromSettings;
}

export async function adminCreateBoxPreset(payload: {
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  defaultWeightLb?: number | null;
}): Promise<ShippingBoxPreset[]> {
  const response = await adminFetch('/api/admin/settings/shipping/box-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failWithResponse(response, 'Failed to create box preset');
  const data = await parseJson<any>(response);
  return Array.isArray(data.boxPresets) ? (data.boxPresets as ShippingBoxPreset[]) : [];
}

export async function adminUpdateBoxPreset(
  id: string,
  payload: {
    name: string;
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    defaultWeightLb?: number | null;
  }
): Promise<ShippingBoxPreset[]> {
  const response = await adminFetch(`/api/admin/settings/shipping/box-presets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failWithResponse(response, 'Failed to update box preset');
  const data = await parseJson<any>(response);
  return Array.isArray(data.boxPresets) ? (data.boxPresets as ShippingBoxPreset[]) : [];
}

export async function adminDeleteBoxPreset(id: string): Promise<ShippingBoxPreset[]> {
  const response = await adminFetch(`/api/admin/settings/shipping/box-presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return failWithResponse(response, 'Failed to delete box preset');
  const data = await parseJson<any>(response);
  return Array.isArray(data.boxPresets) ? (data.boxPresets as ShippingBoxPreset[]) : [];
}

export async function adminFetchOrderShipments(orderId: string): Promise<{
  shipments: OrderShipment[];
  summary: { actualLabelTotalCents: number };
}> {
  const response = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/shipments`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return failWithResponse(response, 'Failed to fetch order shipments');
  const data = await parseJson<any>(response);
  return {
    shipments: Array.isArray(data.shipments) ? (data.shipments as OrderShipment[]) : [],
    summary: {
      actualLabelTotalCents: Number(data?.summary?.actualLabelTotalCents || 0),
    },
  };
}

export async function adminCreateOrderShipment(
  orderId: string,
  payload: {
    boxPresetId?: string | null;
    customLengthIn?: number | null;
    customWidthIn?: number | null;
    customHeightIn?: number | null;
    weightLb?: number | null;
  }
): Promise<{ shipment: OrderShipment | null; shipments: OrderShipment[] }> {
  const response = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failWithResponse(response, 'Failed to create shipment');
  const data = await parseJson<any>(response);
  return {
    shipment: (data.shipment || null) as OrderShipment | null,
    shipments: Array.isArray(data.shipments) ? (data.shipments as OrderShipment[]) : [],
  };
}

export async function adminUpdateOrderShipment(
  orderId: string,
  shipmentId: string,
  payload: {
    boxPresetId?: string | null;
    customLengthIn?: number | null;
    customWidthIn?: number | null;
    customHeightIn?: number | null;
    weightLb?: number | null;
  }
): Promise<{ shipment: OrderShipment | null; shipments: OrderShipment[] }> {
  const response = await adminFetch(
    `/api/admin/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) return failWithResponse(response, 'Failed to update shipment');
  const data = await parseJson<any>(response);
  return {
    shipment: (data.shipment || null) as OrderShipment | null,
    shipments: Array.isArray(data.shipments) ? (data.shipments as OrderShipment[]) : [],
  };
}

export async function adminDeleteOrderShipment(orderId: string, shipmentId: string): Promise<OrderShipment[]> {
  const response = await adminFetch(
    `/api/admin/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}`,
    {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    }
  );
  if (!response.ok) return failWithResponse(response, 'Failed to remove shipment');
  const data = await parseJson<any>(response);
  return Array.isArray(data.shipments) ? (data.shipments as OrderShipment[]) : [];
}

export async function adminFetchShipmentQuotes(
  orderId: string,
  shipmentId: string
): Promise<{
  rates: ShipmentQuote[];
  selectedQuoteId: string | null;
  cached: boolean;
  expiresAt: string | null;
  shipments: OrderShipment[];
}> {
  const response = await adminFetch(
    `/api/admin/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}/quotes`,
    {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }
  );
  if (!response.ok) return failWithResponse(response, 'Failed to fetch shipment quotes');
  const data = await parseJson<any>(response);
  return {
    rates: Array.isArray(data.rates) ? (data.rates as ShipmentQuote[]) : [],
    selectedQuoteId: data.selectedQuoteId ?? null,
    cached: !!data.cached,
    expiresAt: data.expiresAt ?? null,
    shipments: Array.isArray(data.shipments) ? (data.shipments as OrderShipment[]) : [],
  };
}

export async function adminBuyShipmentLabel(
  orderId: string,
  shipmentId: string,
  payload?: { quoteSelectedId?: string | null; refresh?: boolean }
): Promise<{
  shipment: OrderShipment | null;
  shipments: OrderShipment[];
  selectedQuoteId: string | null;
  pendingRefresh: boolean;
  refreshed?: boolean;
}> {
  const response = await adminFetch(
    `/api/admin/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}/buy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload || {}),
    }
  );
  if (!response.ok) return failWithResponse(response, 'Failed to buy shipment label');
  const data = await parseJson<any>(response);
  return {
    shipment: (data.shipment || null) as OrderShipment | null,
    shipments: Array.isArray(data.shipments) ? (data.shipments as OrderShipment[]) : [],
    selectedQuoteId: data.selectedQuoteId ?? null,
    pendingRefresh: !!data.pendingRefresh,
    refreshed: data.refreshed === true,
  };
}

