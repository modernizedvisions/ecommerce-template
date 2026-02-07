# Chesapeake Shell Promotions Readiness + Compatibility Report

========================================================
CONCEPTUAL PREFACE (YOU MUST INCLUDE THIS FIRST)
========================================================
We are preparing to port the Shell & Brush promotions system into The Chesapeake Shell. This is a two-layer promotions model that must operate together and stay consistent across the storefront UI, cart, Stripe checkout, emails, and admin orders. The key rule is that the server (not the client) is the source of truth for checkout totals, and Stripe checkout line items must reflect the final discounted prices so receipts and order records never drift from what the customer saw.

Layer A is Auto-Applied Promotions (no code entry). The owner can define exactly one active promotion at a time. The promotion can be global (all products) or scoped to a specific category. It can have a schedule window (start/end), and it may optionally display a site-wide banner. Customers should automatically see discounted prices on product cards, product detail pages, the cart, and the checkout preview. Most importantly, the server must apply the discount when building the Stripe checkout session, so the Stripe session line items match the discounted totals and downstream emails/orders remain correct.

Layer B is Promo Codes (customer-entered at checkout). The owner can create promo codes that customers enter during checkout. Each promo code can do: percent-off only, free shipping only (the “local pickup” use-case), or both. Codes can be global or category-scoped and can be scheduled and enabled/disabled. Validation must be server-side when creating the checkout session; clients cannot be trusted. “Best for customer” logic applies: percent discounts do NOT stack, and per line item we apply the maximum eligible percent (auto vs code). Free shipping from the code can still apply even if the auto percent is higher.

We also require accurate recording of promo usage in Stripe session metadata and in the order record so admin can see what happened after the fact. The order record must capture: `promo_code`, `promo_percent_off`, `promo_free_shipping`, and `promo_source` (auto/code/auto+code). This is essential for reporting and for identifying local pickup vs normal shipping.

Key non-negotiables for the port:
- No pricing mismatches across UI/cart/Stripe/confirmation emails.
- Free shipping override must zero out shipping in Stripe and in downstream totals.
- Admin must see promo usage on orders.
- Existing flows (custom orders/invoices/etc.) remain untouched unless explicitly in scope.

The audit below documents what Chesapeake Shell currently has, what is missing, and where the safest integration points are.

========================================================
1) Chesapeake Shell current architecture snapshot
========================================================
- Stack: React + Vite + TypeScript + Tailwind (`package.json`, `src/main.tsx`, `src/index.css`). Cloudflare Pages Functions in `functions/` (e.g., `functions/api/*`). D1 is configured in `wrangler.toml`. Stripe used server-side in `functions/api/checkout/create-session.ts` and `functions/api/webhooks/stripe.ts`. Email provider is Resend via `functions/_lib/email.ts` (env `RESEND_API_KEY`, `RESEND_FROM`, etc.). R2 image storage via `IMAGES_BUCKET` in `functions/_middleware.ts`.
- Router (react-router-dom) with route-level code splitting in `src/main.tsx`:
  - `/` → `src/pages/HomePage.tsx`
  - `/shop` → `src/pages/ShopPage.tsx`
  - `/product/:productId` → `src/pages/ProductDetailPage.tsx`
  - `/gallery` → `src/pages/GalleryPage.tsx`
  - `/about` → `src/pages/AboutPage.tsx`
  - `/terms` → `src/pages/TermsPage.tsx`
  - `/privacy` → `src/pages/PrivacyPage.tsx`
  - `/checkout` → `src/pages/CheckoutPage.tsx` (lazy)
  - `/checkout/return` → `src/pages/CheckoutReturnPage.tsx` (lazy)
  - `/admin` → `src/pages/AdminPage.tsx` (lazy)
- Admin auth pattern:
  - Client-side header injection: `x-admin-password` / `X-Admin-Password` in `src/lib/adminAuth.ts`.
  - Admin password UI check is currently hardcoded to `admin123` in `src/lib/auth.ts` (local-only).
  - Server-side enforcement exists only on image endpoints (`functions/api/admin/images/upload.ts`, `functions/api/admin/images/[id].ts`) and a debug endpoint (`functions/api/admin/debug-auth.ts`). Most admin APIs (`functions/api/admin/products.ts`, `functions/api/admin/orders.ts`, `functions/api/admin/categories.ts`, etc.) do not validate the admin header at all (risk/compat note).

========================================================
2) Current DB schema + migrations status (READ-ONLY)
========================================================
Source of truth for schema:
- `db/schema.sql` (baseline) and `db/migrations/live_init.sql` (full init).
- Migrations present in `db/migrations/`:
  - `001_add_product_fields.sql`
  - `002_add_messages.sql`
  - `003_add_custom_orders.sql`
  - `004_add_custom_order_images.sql`
  - `004_add_display_order_id.sql`
  - `005_add_custom_invoices.sql`
  - `005_add_order_item_image_url.sql`
  - `006_add_custom_order_shipping_cents.sql`
  - `007_add_custom_orders_archive.sql`
  - `20251230_home_content.sql`
  - `live_init.sql`

Key tables found (from `db/migrations/live_init.sql`):
- `products`, `categories`, `orders`, `order_items`, `order_counters`
- `custom_orders`, `custom_order_counters`
- `custom_invoices`
- `messages`, `gallery_images`, `site_content`, `email_logs`

Promotions-related checks:
- `promotions` table: MISSING (no table in `db/schema.sql` or `db/migrations/live_init.sql`).
- `promo_codes` table: MISSING.
- `orders` promo metadata columns: MISSING. `orders` includes `shipping_cents` and Stripe identifiers but not:
  - `promo_code` (MISSING)
  - `promo_percent_off` (MISSING)
  - `promo_free_shipping` (MISSING)
  - `promo_source` (MISSING)

If missing, migrations that would be needed (conceptual, do NOT apply):
1. Create `promotions` table (S&B equivalent: auto promos).
   - Fields likely needed: `id`, `name`, `is_active`, `scope` (global/category), `category_id`/`category_slug`, `percent_off`, `starts_at`, `ends_at`, `banner_text`, `created_at`, `updated_at`.
2. Create `promo_codes` table.
   - Fields likely needed: `id`, `code`, `is_active`, `scope` (global/category), `category_id`/`category_slug`, `percent_off`, `free_shipping`, `starts_at`, `ends_at`, `usage_limit`, `created_at`, `updated_at`.
3. Alter `orders` table to add promo metadata:
   - `promo_code TEXT`
   - `promo_percent_off INTEGER` (or REAL)
   - `promo_free_shipping INTEGER` (0/1)
   - `promo_source TEXT` (values: `auto`, `code`, `auto+code`)

========================================================
3) Current APIs (public + admin)
========================================================
Public API routes (from `functions/api/*`):
- `GET /api/products` → `functions/api/products.ts`
- `GET /api/products/:id` → `functions/api/products/[id].ts`
- `GET /api/categories` → `functions/api/categories.ts`
- `GET /api/gallery` → `functions/api/gallery.ts`
- `PUT /api/gallery` → `functions/api/gallery.ts`
- `POST /api/messages` → `functions/api/messages.ts`
- `GET /api/site-content` → `functions/api/site-content.ts`
- `GET /api/config/shippingConfig` → `functions/api/config/shippingConfig.ts`
- `POST /api/checkout/create-session` → `functions/api/checkout/create-session.ts`
- `GET /api/checkout/session/:id` → `functions/api/checkout/session/[id].ts`
- `POST /api/checkout/custom-invoice-session` → `functions/api/checkout/custom-invoice-session.ts`
- `POST /api/custom-invoices/create` → `functions/api/custom-invoices/create.ts`
- `GET /api/custom-invoices/:id` → `functions/api/custom-invoices/[id].ts`
- `POST /api/webhooks/stripe` → `functions/api/webhooks/stripe.ts`

Admin API routes (from `functions/api/admin/*`):
- `GET /api/admin/orders` → `functions/api/admin/orders.ts`
- `GET/POST/DELETE /api/admin/products` → `functions/api/admin/products.ts`
- `GET/PUT/DELETE /api/admin/products/:id` → `functions/api/admin/products/[id].ts`
- `GET/POST/PUT/DELETE /api/admin/categories` → `functions/api/admin/categories.ts`
- `GET /api/admin/messages` → `functions/api/admin/messages.ts`
- `DELETE /api/admin/messages/:id` → `functions/api/admin/messages/[id].ts`
- `GET/POST/PUT /api/admin/custom-orders` → `functions/api/admin/custom-orders.ts`
- `GET/PUT /api/admin/custom-orders/:id` → `functions/api/admin/custom-orders/[id].ts`
- `POST /api/admin/custom-orders/:id/send-payment-link` → `functions/api/admin/custom-orders/[id]/send-payment-link.ts`
- `POST /api/admin/custom-orders/:id/archive` → `functions/api/admin/custom-orders/[id]/archive.ts`
- `POST /api/admin/images/upload` → `functions/api/admin/images/upload.ts`
- `DELETE /api/admin/images/:id` → `functions/api/admin/images/[id].ts`
- `GET /api/admin/site-content` → `functions/api/admin/site-content.ts`
- `GET /api/admin/db-health` → `functions/api/admin/db-health.ts`
- `GET /api/admin/debug-auth` → `functions/api/admin/debug-auth.ts`

Required promo endpoints check:
- `GET /api/promotions/active`: MISSING (S&B: public active promo endpoint).
- `/api/admin/promotions`: MISSING (S&B: admin CRUD for auto promos).
- `/api/admin/promo-codes`: MISSING (S&B: admin CRUD for promo codes).
- `POST /api/checkout/create-session`: EXISTS (`functions/api/checkout/create-session.ts`).
- Stripe webhook handler: EXISTS at `POST /api/webhooks/stripe` (`functions/api/webhooks/stripe.ts`).

Checkout request/response shape (current):
- Request payload to `POST /api/checkout/create-session` (`functions/api/checkout/create-session.ts`):
  - `{ items: [{ productId: string; quantity: number }] }`
- Response payload:
  - `{ clientSecret: string; sessionId: string }`
- `GET /api/checkout/session/:id` response (`functions/api/checkout/session/[id].ts`):
  - `{ id, amount_total, currency, customer_email, payment_method_type, payment_method_label, shipping, line_items, shipping_amount, card_last4, card_brand }`
  - `line_items[]`: `{ productName, quantity, lineTotal, imageUrl, oneOff, isShipping, stripeProductId }`

========================================================
4) Current shipping logic (source of truth)
========================================================
- Client-side display: `src/lib/shipping.ts` used in `src/components/cart/CartDrawer.tsx` and `src/pages/CheckoutPage.tsx`.
  - Rule: per-item shipping is the minimum shipping cost among that item’s categories; order shipping is the minimum across all items; if any category shipping is 0, order shipping is 0.
- Server-side Stripe source of truth: `functions/_lib/shipping.ts` and `functions/api/checkout/create-session.ts`.
  - `create-session` loads categories (`shipping_cents`) and computes `shippingCents`.
  - Shipping is represented as a Stripe line item with `price_data` and metadata `{ mv_line_type: 'shipping' }`.
  - Session metadata includes `shipping_cents` only.
- Webhook derives shipping from Stripe session totals/line items/metadata (`functions/api/webhooks/stripe.ts` + `functions/_lib/emailTotals.ts`).

Safest hook point to override shipping to 0 later:
- Server: `functions/api/checkout/create-session.ts` just before shipping line items are appended and metadata is set.
- Client (display only): `src/lib/shipping.ts` (used by cart + checkout preview) to align UI display with server behavior.

========================================================
5) Current frontend price surfaces (where promos would show)
========================================================
- Product cards: `src/components/ProductCard.tsx` uses `product.priceCents`.
- Product detail: `src/pages/ProductDetailPage.tsx` displays `product.priceCents`.
- Cart drawer line items + subtotal: `src/components/cart/CartDrawer.tsx` uses `item.priceCents` from cart store + `calculateShippingCents`.
- Checkout preview: `src/pages/CheckoutPage.tsx` uses cart items or a single product and computes subtotal + shipping for preview.
- Checkout return summary: `src/pages/CheckoutReturnPage.tsx` uses server-provided `line_items` and `shipping_amount` from `GET /api/checkout/session/:id`.
- Cart item price storage: `src/store/cartStore.ts` snapshots `priceCents` when items are added (stored in localStorage). Prices are not recomputed at render time.

========================================================
6) Stripe checkout session creation + metadata
========================================================
- Stripe session created in `functions/api/checkout/create-session.ts`.
  - Uses Stripe `price` IDs for product items (`stripe_price_id`), not `price_data` overrides.
  - Shipping is a `price_data` line item only (name: "Shipping", metadata `mv_line_type: shipping`).
  - Session metadata currently only includes `shipping_cents`.
- Risk/compat note: because product line items use fixed Stripe `price` IDs, per-line-item percent discounts cannot be expressed by simply changing `unit_amount` unless switching to `price_data` or Stripe coupon/discount mechanisms. This is a key decision for the promo port.
- Where to store promo metadata later: `functions/api/checkout/create-session.ts` in `stripe.checkout.sessions.create({ metadata: { ... } })`. The server webhook already reads `session.metadata` in `functions/api/webhooks/stripe.ts`.

========================================================
7) Webhook → order persistence → emails
========================================================
- Webhook handler: `functions/api/webhooks/stripe.ts`
  - Handles `checkout.session.completed` plus logging for other events (`payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.expired`).
  - Ensures `orders` + `order_items` tables exist and inserts order + line items.
  - Shipping is derived via `functions/_lib/emailTotals.ts` using Stripe line items, `session.total_details`, and fallback to metadata `shipping_cents`.
- Email generation:
  - `functions/_lib/orderConfirmationEmail.ts` + `functions/_lib/ownerNewSaleEmail.ts`
  - Totals derived from Stripe line items using `functions/_lib/emailTotals.ts` (no promo fields referenced).
  - Email sending uses Resend (`functions/_lib/email.ts`).
- Promo metadata persistence:
  - MISSING. `orders` table and order insert statements do not include promo fields.
  - Session metadata currently has `shipping_cents` only; no promo fields captured.

========================================================
8) Admin UI readiness
========================================================
- Current Admin tabs in `src/pages/AdminPage.tsx`: Orders, Shop, Messages, Custom Orders, Images, Sold Products.
- Promotions tab: MISSING.
  - Likely insertion point: add a new tab + component in `src/pages/AdminPage.tsx` and `src/components/admin/`.
- Orders modal exists: `src/components/admin/OrderDetailsModal.tsx`.
  - Can be extended to display promo metadata later, but no promo fields exist in `AdminOrder` yet (`src/lib/db/orders.ts`).

========================================================
9) Compatibility diff vs Shell & Brush
========================================================
Feature / Requirement | S&B concept/source | Chesapeake Shell equivalent file(s) OR MISSING | Risk | Notes
--- | --- | --- | --- | ---
Auto promotions table | `promotions` (D1) | MISSING | High | No auto promo schema in `db/schema.sql` / `db/migrations/live_init.sql`.
Promo codes table | `promo_codes` (D1) | MISSING | High | No promo code schema.
Public active promo endpoint | `GET /api/promotions/active` | MISSING | High | No public promo API in `functions/api`.
Admin promotions CRUD | `/api/admin/promotions` | MISSING | High | No admin promo endpoints in `functions/api/admin`.
Admin promo codes CRUD | `/api/admin/promo-codes` | MISSING | High | No admin promo code endpoints.
Checkout applies promos server-side | `POST /api/checkout/create-session` | `functions/api/checkout/create-session.ts` | Med | Exists, but no discount logic yet.
Stripe metadata includes promo fields | `session.metadata` in checkout | MISSING | High | Only `shipping_cents` is stored now.
Webhook persists promo fields | Stripe webhook → orders | MISSING | High | No promo columns in `orders`, no insert/update logic.
Admin orders UI shows promo info | Orders modal | MISSING | Med | `src/components/admin/OrderDetailsModal.tsx` has no promo display.
Email totals match promos | Order confirmation | Partial | Med | Totals are derived from Stripe line items, which is good; needs promo-adjusted Stripe line items to stay correct.

========================================================
10) Implementation prerequisites checklist (NO CODE)
========================================================
Exact env vars that must exist:
- Stripe:
  - `STRIPE_SECRET_KEY` (`functions/api/checkout/create-session.ts`)
  - `STRIPE_WEBHOOK_SECRET` (`functions/api/webhooks/stripe.ts`)
  - `VITE_STRIPE_PUBLISHABLE_KEY` (`src/pages/CheckoutPage.tsx`)
- Site URLs:
  - `VITE_PUBLIC_SITE_URL` (`functions/api/checkout/create-session.ts`)
  - `PUBLIC_SITE_URL` (email links in `functions/_lib/email.ts`)
- Admin:
  - `ADMIN_PASSWORD` (server validation in `functions/api/admin/images/*` and intended use in admin routes)
  - `VITE_DEBUG_ADMIN_AUTH` (client debug flag in `src/lib/adminAuth.ts`)
- Email (Resend):
  - `RESEND_API_KEY`, `RESEND_FROM`/`RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`/`RESEND_REPLY_TO_EMAIL`, `RESEND_OWNER_TO` (see `functions/_lib/email.ts`)
- Images:
  - `IMAGES_BUCKET` (R2 binding) and `PUBLIC_IMAGES_BASE_URL`

Exact DB migrations that must be added/applied before any code port:
1. `promotions` table (auto promos) with fields matching S&B concepts.
2. `promo_codes` table with percent + free shipping fields.
3. `orders` table columns: `promo_code`, `promo_percent_off`, `promo_free_shipping`, `promo_source`.

Exact API routes that must exist before UI work:
- `GET /api/promotions/active` (public, cached ~60s).
- `/api/admin/promotions` (CRUD, x-admin-password).
- `/api/admin/promo-codes` (CRUD, x-admin-password).
- `POST /api/checkout/create-session` must accept optional `promoCode` and apply server-side validation (additive to existing `items` payload).
- Webhook `POST /api/webhooks/stripe` must persist promo metadata to orders and order emails.

Smoke test plan (after implementation, not now):
1. Create one auto promo (global) and verify product card + product detail + cart + checkout preview reflect discount.
2. Create a category-scoped auto promo and verify only eligible items are discounted.
3. Create a promo code with % off and verify server applies it during checkout session creation (inspect Stripe line items).
4. Create a promo code with free shipping and verify shipping line item becomes $0 in Stripe and in confirmation email.
5. Test “best for customer” logic with both auto promo + promo code: ensure max percent per line item, free shipping still applies.
6. Verify `orders` table stores `promo_code`, `promo_percent_off`, `promo_free_shipping`, `promo_source`.
7. Verify admin orders modal displays promo metadata and emails reflect Stripe totals (no manual math drift).

