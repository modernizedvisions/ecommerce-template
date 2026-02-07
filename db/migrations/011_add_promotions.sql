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
