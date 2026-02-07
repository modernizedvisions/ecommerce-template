# Sold Flow Audit

## Summary
The sold flow runs only inside the Stripe webhook. The failure was caused by a mismatch between how checkout line items are created (Stripe `price_data` with product metadata) and how the webhook tried to map line items back to D1 products. The webhook was using Stripe line item `price.product` or `price.id`, which do not match D1 `products.id` or `products.stripe_product_id` when `price_data` is used. As a result, inventory updates touched 0 rows, so products were never marked sold and quantities never decremented.

A fix was implemented to map line items using the `dd_product_id` metadata (set at checkout), and the update query now matches against `id`, `stripe_product_id`, or `stripe_price_id`. Added logging shows which keys were resolved and how many rows were updated per key.

## Data Model (D1)
Products table fields used for sold logic:
- `products.is_sold` (INTEGER, default 0)
- `products.is_one_off` (INTEGER, default 1)
- `products.quantity_available` (INTEGER, default 1)
- `products.is_active` (INTEGER, default 1)
- `products.stripe_product_id` (TEXT)
- `products.stripe_price_id` (TEXT)

Notes:
- There is no `sold_at` column in the current schema (`db/schema.sql`). The API sets `soldAt: undefined` for product rows.
- Sold product list uses `is_sold = 1 OR quantity_available = 0` as the definition of sold.

Orders table fields used for reference:
- `orders.stripe_payment_intent_id` is used for idempotency in webhook inserts.
- `order_items.product_id` stores the resolved product identifier from Stripe line items (currently derived from metadata or Stripe IDs).

## Sold Update Path (Current Code)
Webhook endpoint file:
- `functions/api/webhooks/stripe.ts`

Handled event types:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Sold update logic:
- Executed for standard (non-custom) paid orders.
- Aggregates quantities by product key.
- Decrements `quantity_available` by purchased quantity.
- Sets `is_sold = 1` when `quantity_available` becomes 0 or was NULL.

SQL used in webhook after fix:
```
UPDATE products
SET
  quantity_available = CASE
    WHEN quantity_available IS NULL THEN 0
    WHEN quantity_available > ? THEN quantity_available - ?
    ELSE 0
  END,
  is_sold = CASE
    WHEN quantity_available IS NULL THEN 1
    WHEN quantity_available <= ? THEN 1
    ELSE is_sold
  END
WHERE id = ? OR stripe_product_id = ? OR stripe_price_id = ?;
```

## Checkout -> Line Item Mapping
Checkout session creation (`functions/api/checkout/create-session.ts`):
- Uses `price_data` (not stored Stripe price IDs).
- Sets product metadata `dd_product_id` to `product.stripe_product_id || product.id`.
- The Stripe product created by `price_data` is ephemeral and does NOT match D1 `stripe_product_id`.

## Root Cause Analysis (Why Sold Updates Failed)
Evidence chain:
- Checkout line items are created with `price_data` and include `dd_product_id` metadata.
- The webhook inventory update used `line.price.product` (Stripe product created from `price_data`).
- The webhook inventory update used `line.price.id` (Stripe price created from `price_data`).
- The webhook inventory update used `session.metadata.product_id` (usually unset).
- These keys do not match D1 `products.id` or `products.stripe_product_id`, so the update matched 0 rows.

Outcome:
- Products were never updated (`is_sold` stayed 0, `quantity_available` unchanged).
- Sold list (`/api/products?filter=sold`) remained empty.
- Shop listings did not delist purchased items.

## Fix Summary (Implemented)
File changed:
- `functions/api/webhooks/stripe.ts`

Changes:
- Inventory update now resolves product keys in this order: `dd_product_id` -> `line.price.product` -> `line.price.id` -> `session.metadata.product_id`.
- Update SQL now matches `id`, `stripe_product_id`, or `stripe_price_id`.
- Added log `line items missing product keys`.
- Added log `aggregate` (session id, total keys, key samples).
- Added log `inventory update` with `key`, `qty`, and `changes`.
- Added log `no product rows updated` when changes = 0.

No database migration was required.

## Instrumentation Added
Logs now emitted during sold update:
- `line items missing product keys`
- `aggregate` (session id, total keys, key samples)
- `inventory update` with `key`, `qty`, and `changes`
- `no product rows updated` when changes = 0

No secrets or PII are logged.

## Sold Rendering Queries
Public/shop listing filters:
- `(is_active = 1 OR is_active IS NULL)`
- `(is_sold IS NULL OR is_sold = 0)`
- `(quantity_available IS NULL OR quantity_available > 0)`

Sold products list (gallery/admin) filters:
- `(is_sold = 1 OR quantity_available = 0)`
- plus paid `custom_orders` with `show_on_sold_products = 1`

Admin sold page uses the same endpoint via `fetchSoldProducts`.

## Webhook Wiring + Env
Webhook file:
- `functions/api/webhooks/stripe.ts`

Required env vars:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Failure modes:
- Missing secrets -> 500
- Missing signature -> 400
- Invalid signature -> 400

## Regression Hunt (Git Evidence)
- The inventory update block and checkout `price_data` usage have existed since initial commit.
- The metadata (`dd_product_id`) was added later, but the webhook did not use it.
- Result: once `price_data` line items became the norm, the webhook could no longer map to D1 rows.

## Verification Checklist
One-off product (quantity 1, `is_one_off=1`):
- Complete a test checkout.
- Verify D1: `is_sold=1`, `quantity_available=0`.
- Product disappears from shop listing.
- Product appears in sold products endpoint and admin sold list.

Multi-quantity product (e.g., `quantity_available=5`, `is_one_off=0`):
- Complete checkout for quantity 1.
- Verify D1: `quantity_available=4`, `is_sold` still 0.
- Repeat until quantity hits 0; then `is_sold` becomes 1.

Logs:
- Confirm webhook logs show `inventory update` with non-zero `changes` for each product key.

## Manual Replay (Local)
If Stripe CLI is available, you can replay a real event to the webhook:
1. `stripe listen --forward-to https://<your-domain>/api/webhooks/stripe`
2. `stripe trigger checkout.session.completed`

Use a live checkout for full line item metadata coverage.
