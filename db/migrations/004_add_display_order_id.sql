-- Create order counters table for yearly sequencing
CREATE TABLE IF NOT EXISTS order_counters (
  year INTEGER PRIMARY KEY,
  counter INTEGER NOT NULL
);

-- Ensure uniqueness of display order IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_order_id ON orders(display_order_id);
