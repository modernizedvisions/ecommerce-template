CREATE TABLE IF NOT EXISTS custom_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT,
  description TEXT,
  amount INTEGER,
  message_id TEXT,
  status TEXT DEFAULT 'pending',
  payment_link TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
