# Admin Login Report (Current Site)

## Scope
This report documents how admin login works today in the Chesapeake Shell codebase, including the client-side login flow, credential storage, request headers, and server-side enforcement.

## Primary Files
- UI + flow: `src/pages/AdminPage.tsx`
- Client credential storage + header injection: `src/lib/adminAuth.ts`
- Client password verification: `src/lib/auth.ts`
- Server auth helper: `functions/api/_lib/adminAuth.ts`
- Admin endpoints: `functions/api/admin/*`

## Current Login Flow (Client)
1. User visits `/admin` (`src/pages/AdminPage.tsx`).
2. Login form submits `password` to `verifyAdminPassword()` (`src/lib/auth.ts`).
3. `verifyAdminPassword()` is **hardcoded** to accept only `admin123`.
4. On success:
   - `sessionStorage.admin_token` is set to `demo_token`.
   - Password is stored via `setAdminPassword()` (`sessionStorage` and optionally `localStorage` if “Remember” is checked).
   - Admin UI loads data and uses `adminFetch()` for all admin API calls.
5. On failure: UI shows “Invalid password”.

## Credential Storage (Client)
- `sessionStorage.admin_password` always set on login.
- `localStorage.admin_password` set only when “Remember on this device” is checked.
- `localStorage.admin_password_remember` is a boolean flag that restores the “Remember” checkbox state.
- `sessionStorage.admin_token` is a client-only flag used to keep the admin UI “authenticated”.

## Admin Request Authentication (Client → Server)
- `adminFetch()` injects headers:
  - `x-admin-password: <password>`
  - `X-Admin-Password: <password>`
- If no password is stored, `adminFetch()` throws and triggers the `admin-auth-required` event to force logout.
- If a response returns `401`, the same event is triggered and the user is logged out.

## Server Enforcement
- Server-side check is centralized in `functions/api/_lib/adminAuth.ts`.
- `requireAdmin(request, env)` compares header password to `env.ADMIN_PASSWORD`.
- If missing or mismatched, a `401` JSON response is returned.

## Admin Endpoints with `requireAdmin`
All of the following import and call `requireAdmin()`:
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

## Known Risks / Gaps
- **Hardcoded password on the client:** `verifyAdminPassword()` accepts only `admin123`. If `ADMIN_PASSWORD` in the server environment is different, the admin UI will never allow login even though the server expects another password.
- **Client-only “token”:** `sessionStorage.admin_token` is not validated server-side and only gates the UI.
- **No hashing on client check:** password comparison is plain-text (client-only) and not validated by the server until actual API calls are made.

## Summary
Admin login is currently **client-gated** with a hardcoded password (`admin123`) and **server-enforced** via `requireAdmin()` using `env.ADMIN_PASSWORD`. The admin UI only grants access if the hardcoded password matches, while the server validates requests against `ADMIN_PASSWORD`. If these values diverge, admins will be locked out even if server auth is configured correctly.
