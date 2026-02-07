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
