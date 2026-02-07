# Dover Stripe Tax + Totals + Display Deep Dive

Report date: 2026-01-29
Commit: a47d1b98df4c8780a0b7b69381e25992ba2ce1c4

## High-level system diagram
Cart/DB -> create-session -> Stripe Embedded Checkout -> webhook -> D1 orders -> admin / emails / return page

## File Map
- functions/api/checkout/create-session.ts
- functions/api/checkout/custom-invoice-session.ts
- functions/api/admin/custom-orders/[id]/send-payment-link.ts
- functions/api/checkout/session/[id].ts
- functions/api/webhooks/stripe.ts
- functions/api/lib/shipping.ts
- functions/_lib/shipping.ts
- src/lib/shipping.ts
- src/lib/payments/checkout.ts
- src/pages/CheckoutPage.tsx
- src/components/cart/CartDrawer.tsx
- src/pages/CheckoutReturnPage.tsx
- functions/_lib/emailTotals.ts
- functions/_lib/orderConfirmationEmail.ts
- functions/_lib/ownerNewSaleEmail.ts
- functions/_lib/customOrderPaymentLinkEmail.ts
- functions/api/admin/orders.ts
- src/components/admin/AdminOrdersTab.tsx
- src/components/admin/OrderDetailsModal.tsx
- src/lib/db/orders.ts
- db/schema.sql
- db/migrations/live_init.sql
- db/migrations/014_add_order_canonical_totals.sql
- db/migrations/004_add_display_order_id.sql
- STRIPE_SETUP.md

## 1) Stripe session creation entrypoints (all)

### A) Storefront embedded checkout
- File: functions/api/checkout/create-session.ts
- ui_mode: embedded
- mode: payment
- automatic_tax: enabled
- billing_address_collection: auto
- shipping_address_collection: allowed_countries [US, CA]
- shipping implementation: shipping_options.shipping_rate_data (fixed_amount)
- line items pricing: uses Stripe Price IDs for normal pricing; uses price_data.unit_amount + product (Stripe product id) when promotions apply
- tax_behavior: not set in code (relies on Stripe dashboard price settings)
- tax_code: not set in code (relies on Stripe product tax codes/defaults)
- metadata: shipping_cents, mv_promo_code, mv_free_shipping_applied, mv_percent_off_applied, mv_promo_source, mv_auto_promo_id

Snippet (session create core, <=15 lines):
```ts
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  ui_mode: 'embedded',
  line_items: lineItems,
  return_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
  metadata: { shipping_cents: String(shippingCentsEffective), mv_promo_code: codePromo?.code || '' },
  automatic_tax: { enabled: true },
  shipping_address_collection: { allowed_countries: ['US', 'CA'] },
  shipping_options: shippingOptions,
  billing_address_collection: 'auto',
});
```

Line item pricing behavior (discount vs regular):
```ts
if (appliedPercent > 0) {
  lineItems.push({
    price_data: { currency: 'usd', unit_amount: discountedCents, product: product.stripe_product_id },
    quantity,
  });
} else {
  lineItems.push({ price: product.stripe_price_id, quantity });
}
```

### B) Custom invoice embedded checkout (non-taxable)
- File: functions/api/checkout/custom-invoice-session.ts
- ui_mode: embedded
- mode: payment
- automatic_tax: NOT enabled (explicit note in code)
- billing/shipping: no collection configured
- shipping implementation: none (no shipping_options, no shipping line item)
- line items pricing: price_data.unit_amount with product_data (Custom Invoice)
- tax_behavior: not set
- tax_code: not set
- metadata: invoiceId, type=custom_invoice

Snippet (<=15 lines):
```ts
const session = await stripe.checkout.sessions.create({
  ui_mode: 'embedded',
  mode: 'payment',
  customer_email: invoice.customer_email,
  line_items: [{
    price_data: { currency: invoice.currency || 'usd', unit_amount: invoice.amount_cents,
      product_data: { name: 'Custom Invoice', description: invoice.description } },
    quantity: 1,
  }],
  return_url: `${baseUrl}/invoice/${invoice.id}?result={CHECKOUT_SESSION_ID}`,
  metadata: { invoiceId: invoice.id, type: 'custom_invoice' },
});
```

### C) Admin custom order payment link (hosted checkout)
- File: functions/api/admin/custom-orders/[id]/send-payment-link.ts
- ui_mode: not set (Stripe hosted checkout, uses session.url)
- mode: payment
- automatic_tax: enabled
- billing_address_collection: auto
- shipping_address_collection: allowed_countries [US]
- shipping implementation: shipping_options.shipping_rate_data (fixed_amount)
- line items pricing: price_data.unit_amount with product_data (Custom Order)
- tax_behavior: not set
- tax_code: not set
- metadata: customOrderId, customOrderDisplayId, source, kind, shipping_cents

Snippet (<=15 lines):
```ts
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  customer_email: customerEmail,
  shipping_address_collection: { allowed_countries: ['US'] },
  line_items: lineItems,
  shipping_options: shippingOptions,
  billing_address_collection: 'auto',
  automatic_tax: { enabled: true },
  success_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${baseUrl}/shop?customOrderCanceled=1&co=${encodeURIComponent(displayId)}`,
  metadata: { customOrderId: order.id, shipping_cents: String(shippingCents) },
});
```

## 2) Price representation (base-only vs tax-inclusive)
- DB pricing uses base (pre-tax) amounts in cents: products.price_cents.
- Checkout preview UI shows subtotal + shipping and explicitly says tax is calculated at checkout.
- Stripe Tax computes tax at checkout (automatic_tax enabled on storefront and custom order sessions), implying prices are treated as tax-exclusive in the UX.
- tax_behavior is not set in code; for Price IDs, the tax behavior must be set in Stripe Dashboard (expected: exclusive). For price_data unit_amount, Stripe Tax uses the amounts as provided and computes tax separately.

Evidence:
- DB schema has price_cents on products (db/schema.sql, db/migrations/live_init.sql).
- UI shows "Tax: Calculated at checkout" (src/pages/CheckoutPage.tsx, src/components/cart/CartDrawer.tsx).
- automatic_tax enabled for the main checkout and custom orders (functions/api/checkout/create-session.ts, functions/api/admin/custom-orders/[id]/send-payment-link.ts).

## 3) Shipping representation (shipping_options vs shipping line item)
- Stripe sessions use shipping_options with shipping_rate_data.fixed_amount. No shipping line item is added to line_items in current checkout flows.
- The code still includes shipping line item detection as a fallback (metadata mv_line_type or "shipping" in names), but this is only for totals derivation and backwards compatibility.

Evidence:
- shipping_options in create-session and custom order sessions.
- isShippingLineItem / extractShippingCentsFromLineItems helpers (functions/api/lib/shipping.ts).

## 4) Canonical totals: source, storage, and equation

### Webhook handler + events
- Webhook: functions/api/webhooks/stripe.ts
- Events handled for orders: checkout.session.completed, checkout.session.async_payment_succeeded
- Other events logged/ignored: payment_intent.succeeded, payment_intent.payment_failed, checkout.session.expired

### Canonical totals extraction (Stripe -> D1)
- Canonical totals are derived from the Stripe Checkout Session:
  - session.amount_total
  - session.amount_subtotal
  - session.total_details.amount_shipping
  - session.total_details.amount_tax
  - session.total_details.amount_discount
  - session.currency
- session.shipping_cost.* is not used in Dover for totals.

Snippet (<=15 lines):
```ts
function resolveCanonicalTotals(session: Stripe.Checkout.Session): CanonicalTotals {
  const toCents = (value: unknown) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
  const totalDetails = session.total_details as Stripe.Checkout.Session.TotalDetails | null;
  return {
    amountTotal: toCents(session.amount_total),
    amountSubtotal: toCents(session.amount_subtotal),
    amountShipping: toCents(totalDetails?.amount_shipping),
    amountTax: toCents(totalDetails?.amount_tax),
    amountDiscount: toCents(totalDetails?.amount_discount),
    currency: session.currency || 'usd',
  };
}
```

### Shipping truth source (pre-tax shipping)
- Primary: session.total_details.amount_shipping (Stripe-calculated shipping amount).
- Fallback: sum of shipping line items (if any), via extractShippingCentsFromLineItems.
- The code treats amount_shipping as the shipping amount and separates tax using amount_tax; this yields a pre-tax shipping amount for storage and display.

Snippet (<=15 lines):
```ts
const canonicalTotals = resolveCanonicalTotals(session);
const shippingFromLines = extractShippingCentsFromLineItems(rawLineItems);
const shippingCents =
  canonicalTotals.amountShipping > 0 ? canonicalTotals.amountShipping : shippingFromLines;
```

### Persisted fields (canonical totals)
- Stored in orders: amount_total_cents, amount_subtotal_cents, amount_shipping_cents, amount_tax_cents, amount_discount_cents, currency.
- Legacy field: total_cents is still stored; shipping_cents is also stored for compatibility.

Insert path (standard orders, <=15 lines):
```ts
const amountTotalCents = totals.amountTotal ?? session.amount_total ?? 0;
const amountSubtotalCents = totals.amountSubtotal ?? session.amount_subtotal ?? 0;
const amountShippingCents = totals.amountShipping ?? shippingCents ?? 0;
const amountTaxCents = totals.amountTax ?? (session.total_details as any)?.amount_tax ?? 0;
const amountDiscountCents = totals.amountDiscount ?? (session.total_details as any)?.amount_discount ?? 0;
```

### Canonical equation
total = subtotal + shipping + tax - discount

### Orders totals schema (exact columns)
From db/schema.sql (totals-related columns):
```sql
  total_cents INTEGER,
  currency TEXT,
  amount_total_cents INTEGER,
  amount_subtotal_cents INTEGER,
  amount_shipping_cents INTEGER,
  amount_tax_cents INTEGER,
  amount_discount_cents INTEGER,
  shipping_cents INTEGER,
```

From db/migrations/live_init.sql (totals-related columns):
```sql
  total_cents INTEGER,
  amount_total_cents INTEGER,
  amount_subtotal_cents INTEGER,
  amount_shipping_cents INTEGER,
  amount_tax_cents INTEGER,
  amount_discount_cents INTEGER,
  currency TEXT,
  shipping_cents INTEGER DEFAULT 0,
```

### Schema auto-ensure/backfill
- Webhook ensures orders table and columns exist and adds missing columns (amount_*_cents, shipping_cents, etc.) in functions/api/webhooks/stripe.ts.
- display_order_id generation + backfill uses order_counters and a yearly counter (functions/api/webhooks/stripe.ts + db/migrations/004_add_display_order_id.sql).
- Migration 014 is a no-op because canonical totals already exist in production (db/migrations/014_add_order_canonical_totals.sql).

## 5) Display surfaces inventory (all)

### Embedded Checkout (Stripe UI)
- Surface: Stripe Embedded Checkout (ui_mode: embedded)
- Source: Stripe session (automatic_tax + shipping_options)
- Display: Stripe shows subtotal, shipping, tax, total by default
- Shipping is not derived from total-subtotal; Stripe uses its own breakdown
- Files: functions/api/checkout/create-session.ts, src/pages/CheckoutPage.tsx

### Checkout return/confirmation page
- Endpoint: /api/checkout/session/:id (functions/api/checkout/session/[id].ts)
- Frontend: src/pages/CheckoutReturnPage.tsx
- Data source: Stripe session + total_details (not D1)
- Shipping uses amount_shipping from session.total_details
- Tax uses amount_tax from session.total_details

Snippet (endpoint response, <=15 lines):
```ts
const totalDetails = session.total_details as Stripe.Checkout.Session.TotalDetails | null;
const amountTotal = toCents(session.amount_total);
const amountSubtotal = toCents(session.amount_subtotal);
const amountShipping = toCents(totalDetails?.amount_shipping);
const amountTax = toCents(totalDetails?.amount_tax);
const amountDiscount = toCents(totalDetails?.amount_discount);
```

### Emails (all)
1) Customer order confirmation
- Templates: functions/_lib/orderConfirmationEmail.ts
- Trigger: Stripe webhook (functions/api/webhooks/stripe.ts)
- Totals source: resolveEmailMoneyTotals(session + line items)
- Shipping not derived from total-subtotal; uses total_details.amount_shipping or line item shipping

Snippet (<=15 lines):
```ts
const totalsForEmail = resolveEmailMoneyTotals({
  session,
  lineItems: rawLineItems,
});
```

2) Owner new sale email
- Templates: functions/_lib/ownerNewSaleEmail.ts
- Trigger: Stripe webhook (functions/api/webhooks/stripe.ts)
- Totals source: resolveEmailMoneyTotals(order + session + line items)

3) Custom order payment link email
- Templates: functions/_lib/customOrderPaymentLinkEmail.ts
- Trigger: Admin send payment link (functions/api/admin/custom-orders/[id]/send-payment-link.ts)
- Display: shows subtotal, shipping, "Tax: Calculated at checkout", total
- Totals source: resolveEmailMoneyTotals (shipping from context; no tax yet)

4) Custom invoice email (payment link)
- Template embedded in functions/api/custom-invoices/create.ts
- Displays amount only (no tax fields); checkout session is non-taxable

### Admin UI
1) Orders list
- Component: src/components/admin/AdminOrdersTab.tsx
- Data source: /api/admin/orders (functions/api/admin/orders.ts)
- Uses D1 canonical totals (amount_total_cents) with fallback to total_cents

2) Order details modal
- Component: src/components/admin/OrderDetailsModal.tsx
- Data source: /api/admin/orders (D1)
- Uses amount_*_cents when available; falls back to line items and legacy shipping
- Shipping is not derived from total-subtotal; uses amount_shipping_cents or shipping line items

### Pre-checkout UI
- Cart drawer: src/components/cart/CartDrawer.tsx
  - Shows subtotal + shipping + total; tax is "Calculated at checkout"
- Checkout page preview: src/pages/CheckoutPage.tsx
  - Shows subtotal + shipping + total; tax is "Calculated at checkout"
  - Uses category shipping rule (src/lib/shipping.ts)

## 6) Price editability + checkout truth source

### Source of truth in checkout
- Products table:
  - price_cents (DB base price)
  - stripe_price_id (Stripe Price ID)
  - stripe_product_id (Stripe Product ID)
- Checkout line items:
  - Regular pricing: uses stripe_price_id directly (Stripe price is the immediate truth for charge amount).
  - Discounted pricing: uses price_data.unit_amount computed from DB price_cents + stripe_product_id (DB price becomes the truth for discounted charges).

### Implications for price edits
- If price_cents changes but stripe_price_id is not updated in Stripe, non-discounted checkout will charge the Stripe price, not the new DB price.
- If stripe_price_id changes but DB price_cents is not updated, discounted line items will calculate from stale DB price and can diverge.
- To keep Dover accurate:
  - Update both DB price_cents and the Stripe price (or Stripe price id) together.
  - Ensure the Stripe price id stored in DB is the current active price for the product.

Evidence: functions/api/checkout/create-session.ts and db/schema.sql.

## 7) Stripe Dashboard dependencies (explicit)
Checklist Dover relies on:
- Stripe Tax enabled (STRIPE_SETUP.md)
- Tax registrations in required jurisdictions (STRIPE_SETUP.md)
- Product tax codes set (default txcd_99999999 or per product), because code does not set tax_code
- Prices have tax_behavior = exclusive (required for correct subtotal + tax display when using Price IDs)
- Shipping tax treatment configured in Stripe (shipping rate data has no tax_code)
- Stripe receipts/emails are optional; Dover uses Resend-based emails from webhook

## 8) Why it works (tax display stays correct)
- Automatic tax is enabled on the storefront and custom order checkout sessions.
- Dover uses Stripe-provided total_details for shipping, tax, and discount, avoiding manual tax math.
- Canonical totals are persisted in D1 at webhook time from the full session data.
- Admin UI reads D1 canonical totals instead of recomputing them.
- Checkout return page reads live Stripe session totals for the specific checkout session.
- Pre-checkout UI explicitly avoids faking tax and says "Calculated at checkout".
- Shipping uses Stripe shipping_options so Stripe computes taxable shipping correctly.
- Emails use resolveEmailMoneyTotals which prefers Stripe breakdown and canonical amounts.

## 9) How to port to Chesapeake (Dover patterns to match)
The Chesapeake repo was not provided, so differences below are expressed as Dover requirements to compare against Chesapeake.

- Checkout mode: Dover uses Stripe Embedded Checkout (ui_mode: embedded) for storefront.
- Shipping: Dover uses shipping_options.shipping_rate_data (fixed_amount), not a shipping line item.
- Tax: Dover enables automatic_tax and expects tax-exclusive prices; tax_behavior is configured in Stripe, not in code.
- Totals persistence: Dover stores amount_*_cents from session.total_details in D1 via webhook.
- Return page: Dover uses Stripe session API (/api/checkout/session/:id) rather than D1.
- Discounts: Dover switches to price_data.unit_amount for discounted line items; full-price uses Stripe Price IDs.
- Admin: Dover displays totals from D1 canonical amounts and never derives shipping as total - subtotal.
- Emails: Dover uses Resend templates with resolveEmailMoneyTotals; custom order payment link email shows "Tax: Calculated at checkout".

## Sanity Test SQL
```sql
SELECT
  id,
  display_order_id,
  amount_total_cents,
  amount_subtotal_cents,
  amount_shipping_cents,
  amount_tax_cents,
  amount_discount_cents,
  (amount_subtotal_cents + amount_shipping_cents + amount_tax_cents - amount_discount_cents) AS computed_total_cents,
  (amount_total_cents - (amount_subtotal_cents + amount_shipping_cents + amount_tax_cents - amount_discount_cents)) AS diff_cents
FROM orders
ORDER BY datetime(created_at) DESC
LIMIT 10;
```
