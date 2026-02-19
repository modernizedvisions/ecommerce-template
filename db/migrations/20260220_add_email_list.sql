CREATE TABLE IF NOT EXISTS email_list (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_email ON email_list(email);
CREATE INDEX IF NOT EXISTS idx_email_list_created_at ON email_list(created_at);

