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

CREATE UNIQUE INDEX IF NOT EXISTS idx_images_storage_key ON images(storage_key);
CREATE INDEX IF NOT EXISTS idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_images_kind ON images(kind);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
