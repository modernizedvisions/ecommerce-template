# Image Upload Discovery Report

Date: February 15, 2026
Repo: ecommerce-template (Cloudflare Pages + Vite/React/TS + D1 + R2)
Scope: discovery only (no behavior changes made)

## 1) Current Architecture Summary

- Upload target is Cloudflare R2 via binding `IMAGES_BUCKET`.
- Main upload API is `POST /api/admin/images/upload` (`functions/api/admin/images/upload.ts`).
- Uploaded files are stored under keys:
  - `doverdesign/<scope>/<YYYY>/<MM>/<uuid>.<ext>`
- Public image serving is via document middleware `functions/_middleware.ts`:
  - `GET /images/<storageKey>` fetches from R2 only when key starts with `doverdesign/`.
- D1 is used for image metadata in `images` table (created lazily by code, not migration-driven):
  - `id`, `storage_key`, `public_url`, entity metadata, etc.
- Product/category/gallery/custom-order entities mostly store URL references (and sometimes image IDs) in their own tables.

## 2) Required Config / Bindings

Required for upload/auth path:

- D1 binding:
  - `DB`
- R2 binding:
  - `IMAGES_BUCKET`
- Admin auth env:
  - `ADMIN_PASSWORD_SALT_B64`
  - `ADMIN_PASSWORD_HASH_B64`
  - `ADMIN_PASSWORD_ITERS`
  - `ADMIN_SESSION_TTL_DAYS`

Optional but used:

- `PUBLIC_IMAGES_BASE_URL` (image URL generation fallback uses request origin)
- `IMAGE_DEBUG=1` (extra debug payload in upload errors)
- `PUBLIC_SITE_URL` / `VITE_PUBLIC_SITE_URL` (email absolute links)

`wrangler.toml` currently declares:

- `DB` bound to D1 `ecommerce-template`
- `IMAGES_BUCKET` bound to R2 `ecommerce-template`

## 3) Endpoint Inventory (image-related)

### Upload / image storage APIs

- `functions/api/admin/images/upload.ts`
- `functions/api/admin/images/[id].ts`
- `functions/_middleware.ts` (serves `/images/*` from R2)
- `functions/api/lib/images.ts` (schema helpers + URL normalization + ID/URL resolution)

### Entity APIs that consume image refs

- Products:
  - `functions/api/admin/products.ts`
  - `functions/api/admin/products/[id].ts`
  - `functions/api/products.ts`
  - `functions/api/products/[id].ts`
- Categories:
  - `functions/api/admin/categories.ts`
  - `functions/api/categories.ts`
- Gallery:
  - `functions/api/gallery.ts`
- Custom orders/examples:
  - `functions/api/admin/custom-orders.ts`
  - `functions/api/admin/custom-orders/[id].ts`
  - `functions/api/admin/custom-orders/examples.ts`
  - `functions/api/custom-orders/examples.ts`
- Messages/contact:
  - `functions/api/messages.ts`
  - `functions/api/admin/messages.ts`
  - `functions/api/_lib/messagesSchema.ts`

### Checkout/order/email image resolution

- `functions/api/checkout/create-session.ts`
- `functions/api/checkout/session/[id].ts`
- `functions/api/admin/orders.ts`
- `functions/api/webhooks/stripe.ts`
- `functions/_lib/customOrderEmailImages.ts`
- `functions/_lib/orderConfirmationEmail.ts`
- `functions/_lib/ownerNewSaleEmail.ts`

### Frontend callers / UI

- Shared API client:
  - `src/lib/api.ts`
  - `src/lib/adminAuth.ts`
  - `src/lib/images.ts`
  - `src/lib/imageOptimization.ts`
- Admin screens:
  - `src/pages/AdminPage.tsx`
  - `src/components/admin/AdminShopTab.tsx`
  - `src/components/admin/AdminGalleryTab.tsx`
  - `src/components/admin/AdminHomeTab.tsx`
  - `src/components/admin/ShopCategoryCardsSection.tsx`
  - `src/components/admin/CategoryCardEditor.tsx`
  - `src/components/admin/AdminCustomOrdersTab.tsx`
  - `src/components/admin/AdminCustomOrderExamplesTab.tsx`
- Public display:
  - `src/lib/hooks/useGalleryImages.ts`
  - `src/pages/GalleryPage.tsx`
  - `src/pages/ProductDetailPage.tsx`
  - `src/components/ProductCard.tsx`
- Contact image flow (separate from R2 upload):
  - `src/components/ContactForm.tsx`

### Migrations and schema files related to images

- `db/migrations/live_init.sql`
- `db/migrations/001_add_product_fields.sql`
- `db/migrations/002_add_messages.sql`
- `db/migrations/003_custom_order_examples.sql`
- `db/migrations/004_add_custom_order_images.sql` (no-op)
- `db/migrations/005_add_order_item_image_url.sql` (no-op)
- `db/schema.sql`

## 4) End-to-End Flows

### A) Product images (admin add/edit)

Flow:

- UI: `AdminShopTab` -> `AdminPage` image handlers -> `adminUploadImage()` (`src/lib/api.ts`)
- API call: `POST /api/admin/images/upload?scope=products` with `multipart/form-data` field `file`
- Server:
  - auth required (`/api/admin/*` middleware + `requireAdmin`)
  - validates multipart, mime (`jpeg/png/webp`), max 8 MB
  - writes to R2 (`IMAGES_BUCKET.put`)
  - inserts metadata row in `images` table (if `DB` exists)
- Response:
  - `{ ok:true, image:{ id, storageKey, publicUrl }, warning? }`
- UI state:
  - stores `url`, `imageId`, `storageKey` in managed image state
  - on save, sends product payload to `/api/admin/products` or `/api/admin/products/:id` with:
    - `imageUrl` (primary)
    - `imageUrls` (secondary)
    - `primaryImageId`
    - `imageIds`
- D1 product columns used:
  - `image_url`, `image_urls_json`, `primary_image_id`, `image_ids_json`

Primary logic:

- Primary image is UI order-driven (`isPrimary` in state) and persisted as `image_url` + `primary_image_id`.

### B) Category images + hero images

Flow:

- UI uploaders:
  - `CategoryCardEditor`
  - `ShopCategoryCardsSection`
  - both call `adminUploadImageScoped(file, { scope: 'categories' })`
- API upload:
  - `POST /api/admin/images/upload?scope=categories`
- Category save:
  - `/api/admin/categories` (`POST/PUT`)
  - stores `image_url`, `hero_image_url`, optional `image_id`, `hero_image_id`

Notes:

- Category image IDs are resolved via `images` table helpers when provided.
- URLs are normalized to `/images/...` style for client consumption.

### C) Gallery images (admin uploads + public gallery)

Flow:

- Admin UI `AdminGalleryTab` uploads each file through `adminUploadImageScoped(..., scope:'gallery')`
- Upload API same as above (`/api/admin/images/upload?scope=gallery`)
- Save ordering/visibility:
  - `PUT /api/gallery` with JSON `{ images: [...] }`
  - persists to `gallery_images`
- Public display:
  - `GET /api/gallery` -> `useGalleryImages` -> `GalleryPage`

Request/validation details:

- Upload request: multipart form
- Save request: JSON
- Gallery URL guard rejects `data:` URLs and >2000 char URLs

### D) Custom order example images

Flow:

- Admin UI `AdminCustomOrderExamplesTab` uploads with scope `custom-orders`
- Upload API: `POST /api/admin/images/upload?scope=custom-orders`
- Save examples: `PUT /api/admin/custom-orders/examples` with JSON examples array
- Public examples: `GET /api/custom-orders/examples`

Persistence:

- Saved in `custom_order_examples.image_url` (URL string), not strongly linked to `images.id`.

### E) Contact form / messages image upload

Flow (separate pipeline, no R2):

- UI `ContactForm` reads file client-side, compresses to JPEG data URL
- Sends JSON to `POST /api/messages` with `imageUrl` as `data:image/...;base64,...`
- Server stores data URL directly into `messages.image_url`
- Email sender attaches parsed data URL as email attachment

Validation:

- Client: raw file <= 8 MB, image type required
- Server: rejects very large data URL (> ~1.8M chars)

### F) Order confirmation thumbnails / email image resolution

Checkout/session view (`GET /api/checkout/session/:id`):

- Line item image preference:
  - custom order `custom_orders.image_url` for custom orders
  - else product `image_url`, fallback first `image_urls_json`
  - else Stripe line-item image
- normalized via server image URL helper

Webhook/email (`functions/api/webhooks/stripe.ts`):

- For custom orders, resolves image with `resolveCustomOrderEmailImage()`:
  - prefer `image_id` -> lookup `images.storage_key/public_url`
  - fallback `image_storage_key`
  - fallback `image_url`
- Email-safe URL normalization blocks `data:`/`blob:` and overlong values.

## 4.1) Per-Flow Request/Persistence Details

### A) Products

- Request type:
  - upload: multipart (`file`)
  - product save: JSON
- Max files / size:
  - UI enforces max 4 image slots
  - server enforces 8 MB per upload request
- Content validation:
  - upload accepts jpeg/png/webp only
  - product save rejects `data:image/...` URLs
- Storage naming:
  - `doverdesign/products/YYYY/MM/<uuid>.<ext>`
- D1 image row:
  - yes (`images` row inserted by upload endpoint)
  - entity linkage fields exist but are usually null unless explicitly passed
- API return:
  - upload returns `image.id` + `image.publicUrl` + `image.storageKey`
- Primary handling:
  - set by admin UI order (`isPrimary`), persisted as `image_url` + `primary_image_id`

### B) Categories / Hero

- Request type:
  - upload: multipart (`scope=categories`)
  - category save: JSON
- Max files / size:
  - one file per interaction; server still 8 MB per upload
- Content validation:
  - upload mime checks
  - category API rejects data URLs and overly long URLs
- Storage naming:
  - `doverdesign/categories/YYYY/MM/<uuid>.<ext>`
- D1 image row:
  - yes for upload (`images`)
  - category table stores URL + optional image IDs
- API return:
  - upload returns both ID and URL
- Primary handling:
  - not a multi-image primary model; separate `image` vs `heroImage`

### C) Gallery

- Request type:
  - upload: multipart (`scope=gallery`)
  - save order/visibility: JSON `PUT /api/gallery`
- Max files / size:
  - multi-select in admin UI; server 8 MB per uploaded file request
- Content validation:
  - upload mime checks
  - gallery save rejects data URLs and >2000-char URLs
- Storage naming:
  - `doverdesign/gallery/YYYY/MM/<uuid>.<ext>`
- D1 image row:
  - yes in `images` from upload endpoint
  - gallery entity uses `gallery_images` table rows
- API return:
  - upload returns ID+URL
  - gallery save returns normalized image list
- Primary handling:
  - none; gallery uses ordering (`sort_order/position`)

### D) Custom order examples

- Request type:
  - upload: multipart (`scope=custom-orders`)
  - save examples: JSON `PUT /api/admin/custom-orders/examples`
- Max files / size:
  - one per slot interaction; 9 slots in UI; server 8 MB per upload
- Content validation:
  - upload mime checks
  - examples API rejects data/blob URLs and long URLs
- Storage naming:
  - `doverdesign/custom-orders/YYYY/MM/<uuid>.<ext>`
- D1 image row:
  - yes in `images` from upload endpoint
  - examples table persists URL strings (`custom_order_examples.image_url`)
- API return:
  - upload returns ID+URL
  - examples save returns normalized examples
- Primary handling:
  - none

### E) Contact/messages images

- Request type:
  - JSON only (`POST /api/messages`) with `imageUrl` as data URL string
- Max files / size:
  - client raw file guard: 8 MB
  - server message guard: ~1.8M characters for data URL
- Content validation:
  - client checks `image/*`
  - server size guard only (not R2 mime validation path)
- Storage naming:
  - none (no R2 object key)
- D1 image row:
  - no `images` table row
  - stores directly in `messages.image_url`
- API return:
  - message submission returns success/id timestamps
- Primary handling:
  - none

### F) Checkout/session + email thumbnails

- Request type:
  - checkout/session retrieval JSON only
  - webhook-driven email generation (server-side)
- Max files / size:
  - N/A at this stage; resolves existing URLs only
- Content validation:
  - email resolver blocks `data:`/`blob:` and overly long strings
- Storage naming:
  - uses previously stored keys/URLs
- D1 image row:
  - optionally read via `image_id` in webhook custom order path
- API return:
  - checkout session returns `line_items[*].imageUrl`
  - webhook not client-facing
- Primary handling:
  - product image selection prefers `image_url`, then first `image_urls_json`

## 5) Upload Contract Details

`POST /api/admin/images/upload`

- Auth: required admin session cookie (`mv_admin_session`)
- Request type: `multipart/form-data`
  - preferred file field: `file`
  - fallback accepted: first `files[]`
- Allowed content types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 8 MB (`MAX_UPLOAD_BYTES`)
- Scopes accepted: `products`, `gallery`, `home`, `categories`, `custom-orders`
- Success response:
  - `ok`, `image.id`, `image.storageKey`, `image.publicUrl`, optional `warning`
- Common failure codes:
  - `ADMIN_UNAUTH` (401)
  - `MISSING_R2` (500)
  - `BAD_MULTIPART` (400)
  - `UNSUPPORTED_TYPE` (415)
  - `UPLOAD_TOO_LARGE` (413)
  - `R2_PUT_FAILED` (500)
  - `UPLOAD_FAILED` (500)

## 6) Schema Reality (code expectations vs migrations)

### Tables/columns actively used by image code

- `images`
  - expected by upload + ID/URL resolution helpers
  - created lazily in code (`ensureImagesSchema`) not by migration
- `products`
  - `image_url`, `image_urls_json`, `primary_image_id`, `image_ids_json`
- `categories`
  - `image_url`, `hero_image_url`, `image_id`, `hero_image_id`
- `gallery_images`
  - `url`, `image_url`, `image_id`, `alt_text`, `hidden`, `is_active`, `sort_order`, `position`
- `custom_orders`
  - `image_url`, `image_id`, `image_storage_key`
- `custom_order_examples`
  - `image_url` (+ text metadata)
- `messages`
  - `image_url` (data URL path)
- `order_items`
  - `image_url`

### Migration coverage observations

- `live_init.sql` creates most app tables for fresh bootstrap, including `gallery_images`, `orders`, `order_items`, etc.
- Dedicated migrations do NOT consistently cover all image-related columns now used by code.
- Several APIs rely on runtime `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` during requests.

Gaps / drift indicators:

- No migration creates `images` table; runtime helper does.
- Product `primary_image_id` and `image_ids_json` are runtime-added if missing.
- Category `image_id` and `hero_image_id` are runtime-added if missing.
- Gallery `image_id` is runtime-added if missing.
- Custom order `image_id` / `image_storage_key` are runtime-added if missing.

## 7) Reproduction and Captured Failures

Local repro was run on February 15, 2026 using `wrangler pages dev dist`.

### Failure case captured

- Endpoint: `POST /api/admin/auth/login`
- Status: `500`
- Body: `{"ok":false,"code":"SERVER_ERROR"}`
- Server log (stderr): `Invalid ADMIN_PASSWORD_ITERS`

Resulting downstream behavior:

- `POST /api/admin/images/upload` returns `401` with `{"ok":false,"code":"ADMIN_UNAUTH"}` when auth cannot be established.

### Healthy path captured (with temporary `.dev.vars`)

- `POST /api/admin/auth/login` wrong password -> `401 BAD_PASSWORD`
- `POST /api/admin/auth/login` correct password -> `200 { ok:true, expiresAt }`
- `GET /api/admin/auth/me` (with cookie) -> `200 { ok:true }`
- `POST /api/admin/images/upload?scope=products` (with cookie) -> `200 ok:true`
- `POST /api/admin/images/upload?scope=gallery` (with cookie) -> `200 ok:true`

This confirms core upload code path works when auth env + bindings are correct.

## 8) Top 3 Likely Causes of Current Upload Failures

1) R2 binding mismatch in Pages settings (most likely)

- Code hard-requires `env.IMAGES_BUCKET`.
- Upload endpoint explicitly returns `MISSING_R2` if binding missing.
- Existing project context/screenshots indicated a typo variant (`IMAES_BUCKET`) previously.
- Inference: if Pages binding name != `IMAGES_BUCKET`, uploads fail regardless of frontend state.

2) Admin auth env not configured or invalid in Pages

- Login endpoint fails with `SERVER_ERROR` when PBKDF2 env is invalid/missing.
- Captured local server error shows invalid `ADMIN_PASSWORD_ITERS` triggers this exactly.
- If admin login fails, upload endpoint returns `ADMIN_UNAUTH` because session cookie is never issued.

3) Schema/migration drift (runtime schema mutation dependence)

- Upload succeeds even if metadata insert fails (returns warning), but many admin screens depend on expected columns/tables.
- Repo already exhibited missing-table behavior in another area (`orders`, `order_items`), showing migration state drift risk.
- Mixed strategy (migrations + runtime ALTERs) increases environment-specific breakage risk.

## 9) Reliability Scorecard

- Bindings correctness (`DB`, `IMAGES_BUCKET`): Medium risk
  - Hard failure when misnamed.
- Auth config (PBKDF2 env): Medium/High risk
  - Hard failure for all admin uploads if invalid.
- API contract consistency: Medium risk
  - Current clients use `/api/admin/images/upload` correctly.
  - Legacy endpoint `functions/api/admin/upload-image.ts` still exists and can confuse future callers.
- Validation/limits: Medium
  - Client optimization helps, but fallback can still hit 8 MB limit.
- Schema management: High risk
  - Runtime schema mutation across many endpoints instead of migration-only source of truth.
- Security hardening: Medium risk
  - `PUT /api/gallery` currently has no admin auth gate.

## 10) Improvement Options (not implemented)

### Option 1: Keep R2 + unify upload path hardening (recommended smallest fix)

- Keep `/api/admin/images/upload` as single uploader.
- Add strict startup checks and explicit health endpoint for bindings/env.
- Keep existing entity save APIs; tighten validation and error codes.

Pros:

- Minimal architectural change
- Fastest path to stabilize current failures
- Compatible with existing data and UI

Cons:

- Still stores full-size originals only (no built-in transforms)
- Schema drift remains unless migration strategy is also tightened

### Option 2: Direct-to-R2 signed upload + finalize API

- Browser uploads directly to R2 with signed URL/token.
- Finalize call writes D1 metadata and entity links.

Pros:

- Less server upload pressure/timeouts
- Better large-file handling

Cons:

- More client complexity and state handling
- Requires careful auth/signature design

### Option 3: Cloudflare Images

- Use Cloudflare Images for storage + variants/thumbnails.

Pros:

- Built-in transforms and delivery tooling
- Better media operations ergonomics

Cons:

- Vendor/service migration work
- Requires model and API contract changes

### Option 4: Background thumbnail pipeline

- Keep R2 originals, generate derivatives async.

Pros:

- Better performance for gallery/shop grids

Cons:

- Additional moving parts (queues/workers)
- Not necessary to solve current upload failures first

## 11) Recommended Next Step

Smallest reliable direction:

- Keep current R2 upload architecture.
- Fix configuration validation and deployment consistency first.

### What to change first (max 3)

1. Add and run a preflight checklist in each environment (prod + preview):
   - `DB` binding exists
   - `IMAGES_BUCKET` binding exists (exact name)
   - admin PBKDF2 env values present and valid
2. Make migrations authoritative for image-related schema (`images`, product/category/gallery/custom-order image columns), then remove runtime schema mutation where practical.
3. Keep one upload endpoint (`/api/admin/images/upload`) and retire legacy `/api/admin/upload-image.ts` route to avoid accidental contract drift.

### What NOT to touch yet

- Do not migrate to a different storage product yet.
- Do not refactor checkout/order email logic until upload + schema stability is verified.
- Do not change entity data models broadly before fixing env/binding/migration consistency.

## 12) Notes on Minimal Instrumentation

No new instrumentation was added because this repo already has structured upload error codes/logging in `functions/api/admin/images/upload.ts`, plus debug endpoints (`functions/api/_debug/shop-images-state.ts`, `functions/api/admin/db-health.ts`) that are sufficient for immediate diagnosis.
