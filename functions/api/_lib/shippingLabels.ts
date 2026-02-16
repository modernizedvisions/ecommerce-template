export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type ShippingLabelsEnv = {
  DB: D1Database;
};

type SiteSettingsRow = {
  id: number;
  ship_from_name: string | null;
  ship_from_address1: string | null;
  ship_from_address2: string | null;
  ship_from_city: string | null;
  ship_from_state: string | null;
  ship_from_postal: string | null;
  ship_from_country: string | null;
  ship_from_phone: string | null;
  updated_at: string | null;
};

type BoxPresetRow = {
  id: string;
  name: string;
  length_in: number;
  width_in: number;
  height_in: number;
  default_weight_lb: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderShipmentRow = {
  id: string;
  order_id: string;
  parcel_index: number;
  box_preset_id: string | null;
  custom_length_in: number | null;
  custom_width_in: number | null;
  custom_height_in: number | null;
  weight_lb: number;
  easyship_shipment_id: string | null;
  easyship_label_id: string | null;
  carrier: string | null;
  service: string | null;
  tracking_number: string | null;
  label_url: string | null;
  label_cost_amount_cents: number | null;
  label_currency: string | null;
  label_state: 'pending' | 'generated' | 'failed' | null;
  quote_selected_id: string | null;
  error_message: string | null;
  created_at: string | null;
  purchased_at: string | null;
  updated_at: string | null;
  box_name?: string | null;
  box_length_in?: number | null;
  box_width_in?: number | null;
  box_height_in?: number | null;
  box_default_weight_lb?: number | null;
};

type OrderAddressRow = {
  id: string;
  shipping_name: string | null;
  shipping_address_json: string | null;
  customer_email: string | null;
};

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const nowIso = () => new Date().toISOString();

export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });

export async function ensureShippingLabelsSchema(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ship_from_name TEXT,
        ship_from_address1 TEXT,
        ship_from_address2 TEXT,
        ship_from_city TEXT,
        ship_from_state TEXT,
        ship_from_postal TEXT,
        ship_from_country TEXT NOT NULL DEFAULT 'US',
        ship_from_phone TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`
    )
    .run();
  await db.prepare(`INSERT OR IGNORE INTO site_settings (id, ship_from_country) VALUES (1, 'US');`).run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS shipping_box_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        length_in REAL NOT NULL,
        width_in REAL NOT NULL,
        height_in REAL NOT NULL,
        default_weight_lb REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS order_shipments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        parcel_index INTEGER NOT NULL,
        box_preset_id TEXT,
        custom_length_in REAL,
        custom_width_in REAL,
        custom_height_in REAL,
        weight_lb REAL NOT NULL,
        easyship_shipment_id TEXT,
        easyship_label_id TEXT,
        carrier TEXT,
        service TEXT,
        tracking_number TEXT,
        label_url TEXT,
        label_cost_amount_cents INTEGER,
        label_currency TEXT NOT NULL DEFAULT 'USD',
        label_state TEXT NOT NULL DEFAULT 'pending',
        quote_selected_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        purchased_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (box_preset_id) REFERENCES shipping_box_presets(id) ON DELETE SET NULL,
        CHECK (label_state IN ('pending', 'generated', 'failed'))
      );`
    )
    .run();

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_order_parcel ON order_shipments(order_id, parcel_index);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_order_shipments_order ON order_shipments(order_id);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_order_shipments_label_state ON order_shipments(label_state);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_order_shipments_purchased_at ON order_shipments(purchased_at);`).run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS order_rate_quotes (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        shipment_temp_key TEXT NOT NULL,
        rates_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );`
    )
    .run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_order_rate_quotes_order_key ON order_rate_quotes(order_id, shipment_temp_key);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_order_rate_quotes_expires ON order_rate_quotes(expires_at);`).run();
}

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

export type ShippingDestination = {
  name: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export async function readShippingSettings(db: D1Database): Promise<ShipFromSettings> {
  const row = await db
    .prepare(
      `SELECT id, ship_from_name, ship_from_address1, ship_from_address2, ship_from_city, ship_from_state, ship_from_postal, ship_from_country, ship_from_phone, updated_at
       FROM site_settings WHERE id = 1;`
    )
    .first<SiteSettingsRow>();

  return {
    shipFromName: row?.ship_from_name ?? '',
    shipFromAddress1: row?.ship_from_address1 ?? '',
    shipFromAddress2: row?.ship_from_address2 ?? '',
    shipFromCity: row?.ship_from_city ?? '',
    shipFromState: row?.ship_from_state ?? '',
    shipFromPostal: row?.ship_from_postal ?? '',
    shipFromCountry: row?.ship_from_country ?? 'US',
    shipFromPhone: row?.ship_from_phone ?? '',
    updatedAt: row?.updated_at ?? null,
  };
}

export function validateShipFrom(settings: ShipFromSettings): string[] {
  const missing: string[] = [];
  if (!settings.shipFromName.trim()) missing.push('shipFromName');
  if (!settings.shipFromAddress1.trim()) missing.push('shipFromAddress1');
  if (!settings.shipFromCity.trim()) missing.push('shipFromCity');
  if (!settings.shipFromState.trim()) missing.push('shipFromState');
  if (!settings.shipFromPostal.trim()) missing.push('shipFromPostal');
  if (!settings.shipFromCountry.trim()) missing.push('shipFromCountry');
  return missing;
}

export async function listShippingBoxPresets(db: D1Database): Promise<ShippingBoxPreset[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, length_in, width_in, height_in, default_weight_lb, created_at, updated_at
       FROM shipping_box_presets
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, name ASC;`
    )
    .all<BoxPresetRow>();
  return (results || []).map(mapBoxPresetRow);
}

export function mapBoxPresetRow(row: BoxPresetRow): ShippingBoxPreset {
  return {
    id: row.id,
    name: row.name,
    lengthIn: Number(row.length_in),
    widthIn: Number(row.width_in),
    heightIn: Number(row.height_in),
    defaultWeightLb: row.default_weight_lb === null ? null : Number(row.default_weight_lb),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function mapOrderShipmentRow(row: OrderShipmentRow): OrderShipment {
  const labelState: 'pending' | 'generated' | 'failed' =
    row.label_state === 'generated' || row.label_state === 'failed' ? row.label_state : 'pending';
  const effectiveLengthIn =
    row.custom_length_in !== null && row.custom_length_in !== undefined
      ? Number(row.custom_length_in)
      : row.box_length_in !== null && row.box_length_in !== undefined
      ? Number(row.box_length_in)
      : null;
  const effectiveWidthIn =
    row.custom_width_in !== null && row.custom_width_in !== undefined
      ? Number(row.custom_width_in)
      : row.box_width_in !== null && row.box_width_in !== undefined
      ? Number(row.box_width_in)
      : null;
  const effectiveHeightIn =
    row.custom_height_in !== null && row.custom_height_in !== undefined
      ? Number(row.custom_height_in)
      : row.box_height_in !== null && row.box_height_in !== undefined
      ? Number(row.box_height_in)
      : null;

  return {
    id: row.id,
    orderId: row.order_id,
    parcelIndex: Number(row.parcel_index),
    boxPresetId: row.box_preset_id,
    boxPresetName: row.box_name ?? null,
    customLengthIn: row.custom_length_in === null ? null : Number(row.custom_length_in),
    customWidthIn: row.custom_width_in === null ? null : Number(row.custom_width_in),
    customHeightIn: row.custom_height_in === null ? null : Number(row.custom_height_in),
    weightLb: Number(row.weight_lb),
    easyshipShipmentId: row.easyship_shipment_id,
    easyshipLabelId: row.easyship_label_id,
    carrier: row.carrier,
    service: row.service,
    trackingNumber: row.tracking_number,
    labelUrl: row.label_url,
    labelCostAmountCents:
      row.label_cost_amount_cents === null || row.label_cost_amount_cents === undefined
        ? null
        : Number(row.label_cost_amount_cents),
    labelCurrency: row.label_currency || 'USD',
    labelState,
    quoteSelectedId: row.quote_selected_id,
    errorMessage: row.error_message,
    createdAt: row.created_at ?? null,
    purchasedAt: row.purchased_at ?? null,
    updatedAt: row.updated_at ?? null,
    effectiveLengthIn,
    effectiveWidthIn,
    effectiveHeightIn,
  };
}

export async function listOrderShipments(db: D1Database, orderId: string): Promise<OrderShipment[]> {
  const { results } = await db
    .prepare(
      `SELECT
         os.id,
         os.order_id,
         os.parcel_index,
         os.box_preset_id,
         os.custom_length_in,
         os.custom_width_in,
         os.custom_height_in,
         os.weight_lb,
         os.easyship_shipment_id,
         os.easyship_label_id,
         os.carrier,
         os.service,
         os.tracking_number,
         os.label_url,
         os.label_cost_amount_cents,
         os.label_currency,
         os.label_state,
         os.quote_selected_id,
         os.error_message,
         os.created_at,
         os.purchased_at,
         os.updated_at,
         bp.name AS box_name,
         bp.length_in AS box_length_in,
         bp.width_in AS box_width_in,
         bp.height_in AS box_height_in,
         bp.default_weight_lb AS box_default_weight_lb
       FROM order_shipments os
       LEFT JOIN shipping_box_presets bp ON bp.id = os.box_preset_id
       WHERE os.order_id = ?
       ORDER BY os.parcel_index ASC, datetime(os.created_at) ASC;`
    )
    .bind(orderId)
    .all<OrderShipmentRow>();
  return (results || []).map(mapOrderShipmentRow);
}

export async function getOrderShipment(db: D1Database, orderId: string, shipmentId: string): Promise<OrderShipment | null> {
  const row = await db
    .prepare(
      `SELECT
         os.id,
         os.order_id,
         os.parcel_index,
         os.box_preset_id,
         os.custom_length_in,
         os.custom_width_in,
         os.custom_height_in,
         os.weight_lb,
         os.easyship_shipment_id,
         os.easyship_label_id,
         os.carrier,
         os.service,
         os.tracking_number,
         os.label_url,
         os.label_cost_amount_cents,
         os.label_currency,
         os.label_state,
         os.quote_selected_id,
         os.error_message,
         os.created_at,
         os.purchased_at,
         os.updated_at,
         bp.name AS box_name,
         bp.length_in AS box_length_in,
         bp.width_in AS box_width_in,
         bp.height_in AS box_height_in,
         bp.default_weight_lb AS box_default_weight_lb
       FROM order_shipments os
       LEFT JOIN shipping_box_presets bp ON bp.id = os.box_preset_id
       WHERE os.order_id = ? AND os.id = ?
       LIMIT 1;`
    )
    .bind(orderId, shipmentId)
    .first<OrderShipmentRow>();
  return row ? mapOrderShipmentRow(row) : null;
}

export async function orderExists(db: D1Database, orderId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT id FROM orders WHERE id = ? LIMIT 1;`).bind(orderId).first<{ id: string }>();
  return !!row?.id;
}

export async function getNextParcelIndex(db: D1Database, orderId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(parcel_index), 0) AS max_index FROM order_shipments WHERE order_id = ?;`)
    .bind(orderId)
    .first<{ max_index: number | null }>();
  const max = row?.max_index ?? 0;
  return Math.max(0, Number(max)) + 1;
}

export function normalizeParcelInput(body: any): {
  boxPresetId: string | null;
  customLengthIn: number | null;
  customWidthIn: number | null;
  customHeightIn: number | null;
  weightLb: number | null;
  validationErrors: string[];
} {
  const boxPresetId = trimOrNull(body?.boxPresetId);
  const customLengthIn = toFiniteNumberOrNull(body?.customLengthIn);
  const customWidthIn = toFiniteNumberOrNull(body?.customWidthIn);
  const customHeightIn = toFiniteNumberOrNull(body?.customHeightIn);
  const weightLb = toFiniteNumberOrNull(body?.weightLb);
  const validationErrors: string[] = [];

  if (weightLb === null || weightLb <= 0) {
    validationErrors.push('weightLb must be a positive number');
  }

  const hasCustomDims =
    customLengthIn !== null || customWidthIn !== null || customHeightIn !== null;
  if (hasCustomDims) {
    if (customLengthIn === null || customLengthIn <= 0) validationErrors.push('customLengthIn must be a positive number');
    if (customWidthIn === null || customWidthIn <= 0) validationErrors.push('customWidthIn must be a positive number');
    if (customHeightIn === null || customHeightIn <= 0) validationErrors.push('customHeightIn must be a positive number');
  } else if (!boxPresetId) {
    validationErrors.push('boxPresetId or custom dimensions are required');
  }

  return {
    boxPresetId,
    customLengthIn,
    customWidthIn,
    customHeightIn,
    weightLb,
    validationErrors,
  };
}

export function parseOrderAddress(value: unknown): ShippingDestination {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  const postalCandidate =
    trimOrNull(source.postal_code) ||
    trimOrNull(source.postalCode) ||
    trimOrNull(source.zip) ||
    trimOrNull(source.zip_code);
  const countryCandidate = trimOrNull(source.country) || 'US';

  return {
    name: trimOrNull(source.name),
    companyName: trimOrNull(source.company_name) || trimOrNull(source.companyName),
    email: trimOrNull(source.email),
    phone: trimOrNull(source.phone),
    line1: trimOrNull(source.line1),
    line2: trimOrNull(source.line2),
    city: trimOrNull(source.city),
    state: trimOrNull(source.state),
    postalCode: postalCandidate,
    country: countryCandidate,
  };
}

export async function getOrderDestination(db: D1Database, orderId: string): Promise<ShippingDestination | null> {
  const row = await db
    .prepare(`SELECT id, shipping_name, shipping_address_json, customer_email FROM orders WHERE id = ? LIMIT 1;`)
    .bind(orderId)
    .first<OrderAddressRow>();
  if (!row) return null;

  let parsedAddress: ShippingDestination = {
    name: row.shipping_name,
    companyName: null,
    email: row.customer_email,
    phone: null,
    line1: null,
    line2: null,
    city: null,
    state: null,
    postalCode: null,
    country: 'US',
  };
  try {
    const decoded = row.shipping_address_json ? JSON.parse(row.shipping_address_json) : null;
    parsedAddress = {
      ...parseOrderAddress(decoded),
      name: trimOrNull((decoded as any)?.name) || row.shipping_name,
      email: trimOrNull((decoded as any)?.email) || row.customer_email,
    };
  } catch {
    parsedAddress = {
      ...parsedAddress,
      name: row.shipping_name,
      email: row.customer_email,
    };
  }

  return parsedAddress;
}

export function hasRequiredDestination(destination: ShippingDestination | null): boolean {
  if (!destination) return false;
  return Boolean(
    destination.name &&
      destination.line1 &&
      destination.city &&
      destination.state &&
      destination.postalCode &&
      destination.country
  );
}

export async function digestHex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type ShipmentDimensions = {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
};

export function resolveShipmentDimensions(shipment: OrderShipment): ShipmentDimensions | null {
  if (
    shipment.effectiveLengthIn === null ||
    shipment.effectiveWidthIn === null ||
    shipment.effectiveHeightIn === null ||
    !Number.isFinite(shipment.weightLb)
  ) {
    return null;
  }
  if (
    shipment.effectiveLengthIn <= 0 ||
    shipment.effectiveWidthIn <= 0 ||
    shipment.effectiveHeightIn <= 0 ||
    shipment.weightLb <= 0
  ) {
    return null;
  }
  return {
    lengthIn: shipment.effectiveLengthIn,
    widthIn: shipment.effectiveWidthIn,
    heightIn: shipment.effectiveHeightIn,
    weightLb: shipment.weightLb,
  };
}

