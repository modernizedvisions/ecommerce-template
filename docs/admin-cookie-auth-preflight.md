# Admin Cookie Session Auth Preflight Report

## A) Repo structure + runtime
- **Stack**: Vite + React frontend, Cloudflare Pages Functions backend.
  - Vite config present in `vite.config.ts`.
  - React entry at `src/main.tsx` and routed pages in `src/pages/*`.
  - Functions live under `functions/api/*` with routing by filesystem.
- **Functions layout**:
  - Example admin handler: `functions/api/admin/orders.ts`.
  - Middleware: `functions/_middleware.ts` (images route proxy).
- **Env var access**:
  - Standard usage is `context.env` in handlers, e.g. `functions/api/admin/orders.ts` uses `context.env.DB`.
  - A process.env fallback exists only in the debug env handler: `functions/api/_debug/env.ts` uses `getProcessEnv(...)` with `globalThis.process?.env`.
- **Response helpers**:
  - Local `json()` helpers appear in multiple files, e.g. `functions/_middleware.ts` and `functions/api/admin/images/upload.ts`.
  - `Response.json(...)` is used in `functions/api/_lib/adminAuth.ts`.
  - No shared, repo-wide response helper was found beyond per-file helpers.

## B) Current admin auth flow (verified)
- **Login gating logic**: `src/pages/AdminPage.tsx`
  - Loads auth state via a client-only token + stored password:
    - `const token = sessionStorage.getItem('admin_token');`
    - `const storedPassword = getAdminPassword();`
  - If either is present, it sets auth as true and loads data:
    - `sessionStorage.setItem('admin_token', 'demo_token');`
    - `setIsAuthenticated(true); loadAdminData();`
  - Login handler calls `verifyAdminPassword(password)` and, on success, sets the token and stores the password:
    - `sessionStorage.setItem('admin_token', 'demo_token');`
    - `setAdminPassword(password, rememberPassword);`
- **Token flags used**:
  - `sessionStorage.admin_token` is the only UI gating token (client-only).
- **Where password is stored and restored**: `src/lib/adminAuth.ts`
  - Read: `sessionStorage.getItem(ADMIN_PASSWORD_KEY) || localStorage.getItem(ADMIN_PASSWORD_KEY)`
  - Write: `sessionStorage.setItem(ADMIN_PASSWORD_KEY, password)` and optionally `localStorage.setItem(...)`
  - Clear: `sessionStorage.removeItem(...)` and `localStorage.removeItem(...)`
- **How adminFetch injects headers**: `src/lib/adminAuth.ts`
  - `headers.set('x-admin-password', adminPassword);`
  - `headers.set('X-Admin-Password', adminPassword);`
  - If no password, it throws and triggers `admin-auth-required`.
- **Hardcoded password behavior**: `src/lib/auth.ts`
  - `return password === 'admin123';`

## C) Server-side auth enforcement today
- **Implementation**: `functions/api/_lib/adminAuth.ts`
  - Extracts header: `x-admin-password` / `X-Admin-Password`.
  - Compares to `env.ADMIN_PASSWORD`.
  - Returns `Response.json(..., { status: 401 })` when missing/mismatched.
- **Headers checked**:
  - `x-admin-password` and `X-Admin-Password` only.
- **Endpoints under `functions/api/admin/*` that call `requireAdmin()`**:
  - `functions/api/admin/orders.ts`
  - `functions/api/admin/orders/seen.ts`
  - `functions/api/admin/products.ts`
  - `functions/api/admin/products/[id].ts`
  - `functions/api/admin/categories.ts`
  - `functions/api/admin/messages.ts`
  - `functions/api/admin/messages/[id].ts`
  - `functions/api/admin/messages/read.ts`
  - `functions/api/admin/custom-orders.ts`
  - `functions/api/admin/custom-orders/[id].ts`
  - `functions/api/admin/custom-orders/[id]/archive.ts`
  - `functions/api/admin/custom-orders/[id]/send-payment-link.ts`
  - `functions/api/admin/custom-orders/examples.ts`
  - `functions/api/admin/site-content.ts`
  - `functions/api/admin/images/upload.ts`
  - `functions/api/admin/images/[id].ts`
  - `functions/api/admin/upload-image.ts`
  - `functions/api/admin/db-health.ts`
  - `functions/api/admin/debug-auth.ts`
  - `functions/api/admin/promotions.ts`
  - `functions/api/admin/promo-codes.ts`
- **Endpoints under `functions/api/admin/*` missing `requireAdmin()`**:
  - None found. All current admin endpoints call `requireAdmin()`.

## D) Cookie feasibility details
- **Same-origin**:
  - Admin UI calls relative URLs like `/api/admin/...` via `adminFetch` in `src/lib/adminAuth.ts`.
  - Example usage: `adminFetch('/api/admin/messages')` in `src/components/admin/AdminMessagesTab.tsx`.
  - This indicates same-origin in Cloudflare Pages (site + functions) is assumed.
- **Fetch wrapper**:
  - `adminFetch()` currently calls `fetch(input, { ...init, headers })` without a `credentials` option.
  - All admin calls appear to use relative paths (no explicit cross-origin URLs).
- **CORS / credentials config**:
  - Most admin endpoints do not set CORS headers.
  - `functions/api/admin/images/upload.ts` includes permissive CORS (`Access-Control-Allow-Origin: *`) and custom headers, but no credential handling.
  - No client-side `credentials: 'include'` is set today.

## E) Proposed implementation plan (specific)
1. **Add session endpoints (Functions)**:
   - `POST /api/admin/login`
     - Body: `{ password: string }`
     - Validate against `env.ADMIN_PASSWORD`.
     - On success, set session cookie and return `{ ok: true }`.
   - `POST /api/admin/logout`
     - Clear session cookie (expired Max-Age or past Expires) and return `{ ok: true }`.
   - Optional: `GET /api/admin/session` (or `/api/admin/me`)
     - Returns `{ authenticated: true }` if cookie is valid, else 401.
2. **New env var**:
   - `ADMIN_SESSION_SECRET` (server-only) for signing stateless session tokens.
3. **Cookie settings** (recommendations):
   - `HttpOnly`: true
   - `Secure`: true in production (false in local dev if needed)
   - `SameSite`: `Strict` if no cross-site flows; otherwise `Lax`
   - `Path`: `/`
   - `Max-Age`: 8 hours (e.g. `60 * 60 * 8`)
4. **Session format (stateless, signed)**:
   - Token payload: `{ iat, exp }` (and optionally `sub: 'admin'`).
   - Sign with HMAC-SHA256 using WebCrypto (Cloudflare Workers compatible).
   - Use constant-time comparison for signature verification.
5. **Update `requireAdmin()`**:
   - Read `Cookie` header and parse `admin_session` (name to be defined).
   - Verify signature + `exp` against `ADMIN_SESSION_SECRET`.
   - Return 401 if missing/invalid/expired.
6. **Client updates**:
   - `src/lib/adminAuth.ts`:
     - Remove password storage functions and header injection.
     - Set `credentials: 'include'` in `fetch(...)` so cookies are sent.
     - Keep 401 handling to dispatch `admin-auth-required`.
   - `src/pages/AdminPage.tsx`:
     - Replace `verifyAdminPassword()` flow with `POST /api/admin/login`.
     - On load, call `/api/admin/session` (optional) to set `isAuthenticated`.
     - On 401 anywhere, clear auth state and show login screen.
7. **Remove local storage/session storage usage**:
   - Delete `sessionStorage.admin_token` usage.
   - Remove `admin_password` and `admin_password_remember` usage entirely.
8. **Security hardening** (optional but recommended):
   - Rate-limit login attempts at `POST /api/admin/login`.
   - Add response headers like `Cache-Control: no-store` for auth endpoints.

## Ambiguities / what to inspect next (in-code, not questions)
- Confirm whether any admin requests are made outside `adminFetch()` (search `fetch('/api/admin`).
- Check for any service worker or proxy that might alter cookie behavior.
- Verify if any local dev environment relies on `http://localhost` mixed origins.

## F) Stripe Tax Preflight Discovery (2026-01-28)
### Session creation paths + current address/shipping behavior
- `functions/api/checkout/create-session.ts`: embedded Checkout; shipping as a line item; `shipping_address_collection` includes US/CA; no `billing_address_collection`; no `automatic_tax`.
- `functions/api/admin/custom-orders/[id]/send-payment-link.ts`: standard Checkout session; shipping as a line item; `shipping_address_collection` US only; `phone_number_collection` enabled; no `billing_address_collection`; no `automatic_tax`.
- `functions/api/checkout/custom-invoice-session.ts`: embedded session for custom invoices; single line item; no shipping/address collection; no `automatic_tax`.

### Totals display/derived usage
- Cart/checkout preview totals:
  - `src/components/cart/CartDrawer.tsx` and `src/pages/CheckoutPage.tsx` compute total via `subtotal + shipping`.
- Checkout return:
  - `src/pages/CheckoutReturnPage.tsx` displays total and shipping from session response (no tax line yet).
- Admin:
  - `src/components/admin/AdminOrdersTab.tsx` shows `totalCents`.
  - `src/components/admin/OrderDetailsModal.tsx` infers shipping via `total - subtotal` fallback.
- Emails:
  - `functions/_lib/orderConfirmationEmail.ts` and `functions/_lib/ownerNewSaleEmail.ts` show Subtotal/Shipping/Total only.
  - `functions/_lib/customOrderPaymentLinkEmail.ts` computes `subtotal + shipping` for the payment link email.
  - `functions/_lib/emailTotals.ts` derives shipping from `total - subtotal (+discount - tax)` in the current implementation.

## Implementation Notes — Gold Standard Totals
- Shipping moved to Checkout `shipping_options` (no shipping line item).
- Canonical totals persisted in `orders` (subtotal/shipping/tax/discount/total/currency).
- UI/admin/emails render canonical totals; derived shipping math removed.
- Async payments handle `checkout.session.completed` + `checkout.session.async_payment_succeeded` with paid-only fulfillment.
