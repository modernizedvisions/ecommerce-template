PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS site_settings (
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
);

INSERT OR IGNORE INTO site_settings (id, ship_from_country)
VALUES (1, 'US');

CREATE TABLE IF NOT EXISTS shipping_box_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  length_in REAL NOT NULL,
  width_in REAL NOT NULL,
  height_in REAL NOT NULL,
  default_weight_lb REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_shipments (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_order_parcel
  ON order_shipments(order_id, parcel_index);
CREATE INDEX IF NOT EXISTS idx_order_shipments_order
  ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_label_state
  ON order_shipments(label_state);
CREATE INDEX IF NOT EXISTS idx_order_shipments_purchased_at
  ON order_shipments(purchased_at);

CREATE TABLE IF NOT EXISTS order_rate_quotes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  shipment_temp_key TEXT NOT NULL,
  rates_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_rate_quotes_order_key
  ON order_rate_quotes(order_id, shipment_temp_key);
CREATE INDEX IF NOT EXISTS idx_order_rate_quotes_expires
  ON order_rate_quotes(expires_at);

