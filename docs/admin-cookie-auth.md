# Admin Cookie Auth

This repo uses a cookie-based, stateless session for admin access. The server is the source of truth.

## Required environment variables
- `ADMIN_PASSWORD`: single admin password used at login.
- `ADMIN_SESSION_SECRET`: secret used to sign session tokens (HMAC-SHA256).

## How login works
1. Admin enters the password on `/admin`.
2. Client `POST /api/admin/login` with `{ password }`.
3. Server validates `ADMIN_PASSWORD`, signs a session token, and sets `admin_session` as an HttpOnly cookie.
4. All admin API calls rely on the cookie; no client storage is used.

## Cookie details
- Name: `admin_session`
- Storage: HttpOnly cookie (no localStorage/sessionStorage)
- Duration: 8 hours
- SameSite: `Strict`
- Path: `/`
- Secure: set when request URL is HTTPS (local dev over HTTP will not set Secure)

## Session rotation
Rotating `ADMIN_SESSION_SECRET` invalidates all existing sessions and forces a re-login.

## Manual test checklist
1. Visit `/admin` while logged out -> login form shown.
2. Wrong password -> error shown.
3. Correct password -> admin loads; refresh keeps you logged in (until expiry).
4. DevTools > Application > Cookies -> `admin_session` exists and is HttpOnly.
5. Logout -> returns to login, cookie cleared.
6. `GET /api/admin/session` when logged out -> 401.
7. Admin API calls without cookie -> 401 and UI logs out.
