CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO site_content (key, json)
VALUES ('home', '{}');
