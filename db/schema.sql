CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  description TEXT,
  price_cents INTEGER,
  category TEXT,
  image_url TEXT,
  -- Extended fields for inventory + Stripe wiring
  image_urls_json TEXT,
  primary_image_id TEXT,
  image_ids_json TEXT,
  is_active INTEGER DEFAULT 1,
  is_one_off INTEGER DEFAULT 1,
  is_sold INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 1,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  collection TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  image_url TEXT,
  hero_image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  option_group_label TEXT,
  option_group_options_json TEXT,
  show_on_homepage INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL,
  public_url TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  original_filename TEXT,
  entity_type TEXT,
  entity_id TEXT,
  kind TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT,
  total_cents INTEGER,
  currency TEXT,
  amount_total_cents INTEGER,
  amount_subtotal_cents INTEGER,
  amount_shipping_cents INTEGER,
  amount_tax_cents INTEGER,
  amount_discount_cents INTEGER,
  shipping_cents INTEGER,
  customer_email TEXT,
  shipping_name TEXT,
  shipping_address_json TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migration for existing databases (run via Wrangler once per environment):
-- ALTER TABLE orders ADD COLUMN card_last4 TEXT;
-- ALTER TABLE orders ADD COLUMN card_brand TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_id TEXT,
  quantity INTEGER,
  price_cents INTEGER,
  image_url TEXT,
  option_group_label TEXT,
  option_value TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  message TEXT,
  image_url TEXT,
  image_id TEXT,
  type TEXT NOT NULL DEFAULT 'message',
  category_id TEXT,
  category_name TEXT,
  inspo_example_id TEXT,
  inspo_title TEXT,
  inspo_image_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT,
  description TEXT,
  image_url TEXT,
  image_id TEXT,
  image_storage_key TEXT,
  amount INTEGER,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  status TEXT DEFAULT 'pending',
  payment_link TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_order_examples (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  image_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  image_url TEXT,
  image_id TEXT,
  alt_text TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_order_parcel ON order_shipments(order_id, parcel_index);
CREATE INDEX IF NOT EXISTS idx_order_shipments_order ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_label_state ON order_shipments(label_state);
CREATE INDEX IF NOT EXISTS idx_order_shipments_purchased_at ON order_shipments(purchased_at);

CREATE TABLE IF NOT EXISTS order_rate_quotes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  shipment_temp_key TEXT NOT NULL,
  rates_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_rate_quotes_order_key ON order_rate_quotes(order_id, shipment_temp_key);
CREATE INDEX IF NOT EXISTS idx_order_rate_quotes_expires ON order_rate_quotes(expires_at);
