# Stripe Setup (Test Mode)

Follow these steps to get Embedded Checkout working locally (`npm run cf:dev`) and on Cloudflare Pages. Do **not** commit any secrets.

## 1) Get your Stripe keys (TEST mode)
From the Stripe Dashboard → Developers → API keys:
- Secret key: `sk_test_...`
- Publishable key: `pk_test_...`
Keep these private.

For webhooks (optional but recommended):
- After creating a webhook endpoint, copy the signing secret: `whsec_...`

## 2) Local dev configuration
Files go in the project root (same folder as `wrangler.toml`). Do not commit them.

- `.dev.vars` (used by Wrangler / Functions locally):
  ```
  STRIPE_SECRET_KEY=YOUR_STRIPE_TEST_SECRET_KEY_HERE
  STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET_HERE  # optional unless testing webhooks
  ```

- `.env.local` (used by Vite/frontend):
  ```
  VITE_STRIPE_PUBLISHABLE_KEY=YOUR_STRIPE_TEST_PUBLISHABLE_KEY_HERE
  ```

After creating/updating these files, restart dev:
```
npm run cf:dev
```

## 3) Cloudflare Pages (production/staging)
In Cloudflare Dashboard → Pages → (this project) → Settings → Environment Variables, add:
- `STRIPE_SECRET_KEY` = your Stripe secret (test or live)
- `STRIPE_WEBHOOK_SECRET` = your webhook signing secret (if using webhooks)
- `VITE_STRIPE_PUBLISHABLE_KEY` = your publishable key (test or live)

Redeploy after setting these.

## 4) Webhooks (optional, for marking items sold)
Local testing with Stripe CLI:
```
stripe listen --events checkout.session.completed --forward-to http://127.0.0.1:8788/api/webhooks/stripe
```
Use the reported `whsec_...` as `STRIPE_WEBHOOK_SECRET` in `.dev.vars`.

## 5) Troubleshooting
- Error: **"Stripe is not configured"**
  - Server: check `STRIPE_SECRET_KEY` (.dev.vars / Cloudflare env)
  - Client: check `VITE_STRIPE_PUBLISHABLE_KEY` (.env.local / Cloudflare env)
- Error: **"This product has no Stripe price configured."**
  - Ensure the D1 row for that product has a non-null `stripe_price_id` (and price).

Reminder: Add-to-cart can work without Stripe, but checkout requires these keys and Stripe price IDs. Only use test keys until you’re ready for live payments.

## Stripe Dashboard Prereqs (Tax)
- [ ] Enable Stripe Tax in the Dashboard.
- [ ] Add tax registrations for jurisdictions where you must collect tax.
- [ ] Set the default product tax code for physical goods (txcd_99999999).
- [ ] Decide shipping tax treatment and set a shipping preset tax code if shipping is taxable.

Note: Code changes alone cannot fix missing registrations or missing tax codes. Custom invoice Checkout sessions are currently treated as non-taxable and do not enable `automatic_tax`.
