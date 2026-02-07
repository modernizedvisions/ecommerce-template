PRAGMA foreign_keys=ON;

-- Core product catalog
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  description TEXT,
  price_cents INTEGER,
  category TEXT,
  image_url TEXT,
  image_urls_json TEXT,
  is_active INTEGER DEFAULT 1,
  is_one_off INTEGER DEFAULT 1,
  is_sold INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 1,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  collection TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_one_off ON products(is_one_off);
CREATE INDEX IF NOT EXISTS idx_products_is_sold ON products(is_sold);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_stripe_product_id ON products(stripe_product_id);

-- Categories
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

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Orders
-- Canonical orders schema for fresh DB bootstraps; incremental upgrades are handled by migrations.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  display_order_id TEXT,
  order_type TEXT,
  stripe_payment_intent_id TEXT,
  total_cents INTEGER,
  amount_total_cents INTEGER,
  amount_subtotal_cents INTEGER,
  amount_shipping_cents INTEGER,
  amount_tax_cents INTEGER,
  amount_discount_cents INTEGER,
  currency TEXT,
  customer_email TEXT,
  shipping_name TEXT,
  shipping_address_json TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  description TEXT,
  shipping_cents INTEGER DEFAULT 0,
  promo_code TEXT,
  promo_percent_off INTEGER,
  promo_free_shipping INTEGER,
  promo_source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_order_id ON orders(display_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent ON orders(stripe_payment_intent_id);

-- Promotions (Shell & Brush parity)
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percent_off INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global','categories')),
  category_slugs_json TEXT NOT NULL DEFAULT '[]',
  banner_enabled INTEGER NOT NULL DEFAULT 0,
  banner_text TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_promotions_enabled ON promotions(enabled);

-- Promo codes (Shell & Brush parity)
CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  percent_off INTEGER,
  free_shipping INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL CHECK (scope IN ('global','categories')),
  category_slugs_json TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_enabled ON promo_codes(enabled);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_id TEXT,
  quantity INTEGER,
  price_cents INTEGER,
  image_url TEXT,
  option_group_label TEXT,
  option_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_counters (
  year INTEGER PRIMARY KEY,
  counter INTEGER NOT NULL
);

-- Custom orders
CREATE TABLE IF NOT EXISTS custom_orders (
  id TEXT PRIMARY KEY,
  display_custom_order_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  description TEXT,
  image_url TEXT,
  amount INTEGER,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  status TEXT DEFAULT 'pending',
  payment_link TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TEXT,
  shipping_name TEXT,
  shipping_line1 TEXT,
  shipping_line2 TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_postal_code TEXT,
  shipping_country TEXT,
  shipping_phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_orders_display_id ON custom_orders(display_custom_order_id);
CREATE INDEX IF NOT EXISTS idx_custom_orders_status ON custom_orders(status);
CREATE INDEX IF NOT EXISTS idx_custom_orders_created_at ON custom_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_custom_orders_stripe_session_id ON custom_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_custom_orders_stripe_payment_intent_id ON custom_orders(stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS custom_order_counters (
  year INTEGER PRIMARY KEY,
  counter INTEGER NOT NULL
);

-- Custom invoices
CREATE TABLE IF NOT EXISTS custom_invoices (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_custom_invoices_customer_email ON custom_invoices(customer_email);
CREATE INDEX IF NOT EXISTS idx_custom_invoices_status ON custom_invoices(status);
CREATE INDEX IF NOT EXISTS idx_custom_invoices_created_at ON custom_invoices(created_at);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  type TEXT,
  to_email TEXT,
  resend_id TEXT,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  error TEXT
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  message TEXT,
  image_url TEXT,
  type TEXT NOT NULL DEFAULT 'message',
  category_id TEXT,
  category_name TEXT,
  inspo_example_id TEXT,
  inspo_title TEXT,
  inspo_image_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Gallery
CREATE TABLE IF NOT EXISTS gallery_images (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  image_url TEXT,
  alt_text TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Site content (home hero + custom orders)
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_order_examples (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_sort_order ON gallery_images(sort_order);
CREATE INDEX IF NOT EXISTS idx_gallery_images_created_at ON gallery_images(created_at);

-- Baseline rows
-- Other Items is enforced as non-deletable by API logic; schema has no dedicated flag.
INSERT OR IGNORE INTO categories (id, name, slug, show_on_homepage)
VALUES ('other-items', 'Other Items', 'other-items', 1);

INSERT OR IGNORE INTO site_content (key, json)
VALUES ('home', '{}');

