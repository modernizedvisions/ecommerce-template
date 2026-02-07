# Pricing Price Edit Audit (Dover Designs)

## Summary
Editing a product price in Admin previously updated `products.price_cents` only. Stripe Prices are immutable, so the checkout continued to charge the **old** Stripe Price ID stored on the product. This audit documents the data flow and the fix so Stripe always charges the updated price.

## Current Data Sources (before fix)
- **Product table (D1):** `price_cents`, `stripe_price_id`, `stripe_product_id` in `products`.
- **Create product endpoint:** `functions/api/admin/products.ts` creates Stripe Product + Price on create (when Stripe is configured) and stores `stripe_product_id` / `stripe_price_id`.
- **Update product endpoint:** `functions/api/admin/products/[id].ts` updated `price_cents` only (no Stripe price update).
- **Checkout session creation:** `functions/api/checkout/create-session.ts` uses `product.stripe_price_id` for line items (or `price_data` for promos).

## Confirmed Behavior (before fix)
1) Admin price edit updated `price_cents` in DB.
2) Checkout used **existing** `stripe_price_id`, so Stripe charged the old amount.

## Fix Summary (after fix)
Source of truth is the **current DB price + Stripe Price ID**. When price changes:
1) **Create a new Stripe Price** (Stripe Prices are immutable).
2) **Update DB** with the new `stripe_price_id` (and `stripe_product_id` if created).
3) **Checkout** always uses DB `stripe_price_id` (client-provided pricing is ignored).

## Implementation Notes
- **Admin update flow:** `functions/api/admin/products/[id].ts`
  - Detects price change by comparing incoming `priceCents` to existing `price_cents`.
  - Creates Stripe Product if missing; then creates a **new Stripe Price**.
  - Updates DB `price_cents` + `stripe_price_id` in the same update.
  - If Stripe fails, **DB is not updated** and a clear error is returned.
  - Logs price changes with product id + old/new price + Stripe IDs.
- **Checkout flow:** `functions/api/checkout/create-session.ts`
  - Ignores any client-provided price fields.
  - Logs when a client tries to send a Stripe price ID that differs from DB.

## Source of Truth (now)
**DB `products.price_cents` + `products.stripe_price_id`** is the single source of truth. Checkout uses the current DB `stripe_price_id`.

## Manual QA Steps
1) Create product with price $10.00.
2) Confirm DB has `stripe_price_id`.
3) Checkout → Stripe shows $10.00.
4) Edit product price to $12.50.
5) Confirm DB price is $12.50 and `stripe_price_id` changed.
6) Checkout again → Stripe shows $12.50.
7) Edit only description/name → `stripe_price_id` stays the same.
8) If Stripe is misconfigured, price edit returns error and DB price remains unchanged.
