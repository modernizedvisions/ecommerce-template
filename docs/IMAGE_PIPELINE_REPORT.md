# Image Pipeline Report

## TL;DR / Current State
- Products: Admin uploads go to R2 via `/api/admin/images/upload` (`functions/api/admin/images/upload.ts`) using `IMAGES_BUCKET` + `PUBLIC_IMAGES_BASE_URL`; URLs are saved in D1 `products.image_url` and `products.image_urls_json`.
- Gallery: Admin uploads go to R2 via `/api/admin/images/upload?scope=gallery`; URLs are saved in D1 `gallery_images.url`/`image_url`.
- Hero + custom orders images: stored in D1 `site_content` via `/api/admin/site-content`, using R2 URLs (no localStorage).
- Category card images: admin uploads go to R2 via `/api/admin/images/upload?scope=categories`; URLs saved in D1 `categories.image_url` and `categories.hero_image_url`.
- Contact form image: base64 data URL sent to `/api/messages`, stored in D1 `messages.image_url`, and attached to email via Resend.
- Cloudflare Images API env vars exist only in a debug endpoint; no production code uses Cloudflare Images today.

## Repo Scan Summary (Image-Related Files)
- Upload handlers: `functions/api/admin/images/upload.ts`, `functions/api/admin/upload-image.ts` (stub), `functions/api/gallery.ts`, `functions/api/messages.ts`, `functions/api/admin/categories.ts`.
- Frontend upload UI: `src/pages/AdminPage.tsx`, `src/components/admin/AdminShopTab.tsx`, `src/components/admin/AdminGalleryTab.tsx`, `src/components/admin/AdminHomeTab.tsx`, `src/components/admin/ShopCategoryCardsSection.tsx`, `src/components/admin/CategoryCardEditor.tsx`, `src/components/ContactForm.tsx`.
- Storage helpers: `src/lib/db/content.ts` (localStorage), D1 schema in `db/schema.sql` and `db/migrations/live_init.sql`.

## Pipelines (Mapped)

### A) Products (admin shop)
- Frontend upload components:
  - Upload UI and state: `src/components/admin/AdminShopTab.tsx` and `src/pages/AdminPage.tsx`.
  - Upload function: `adminUploadImage()` in `src/lib/api.ts`.
- Endpoint called:
  - `POST /api/admin/images/upload?rid=<uuid>`
  - Request headers: `X-Upload-Request-Id: <uuid>`
  - Payload: `multipart/form-data` with `file` field (single file).
- Backend handler:
  - `functions/api/admin/images/upload.ts`
  - Methods: `POST` (upload), `OPTIONS` (CORS), `GET` returns 405.
  - Limits: max 8 MB; allowed types `image/jpeg`, `image/png`, `image/webp`.
  - Storage: R2 bucket key `chesapeake-shell/YYYY/MM/<uuid>.<ext>`.
  - Response JSON: `{ id: <key>, url: <PUBLIC_IMAGES_BASE_URL>/<key>, fingerprint: <build> }`.
- DB update path:
  - Product save uses `POST /api/admin/products` or `PUT /api/admin/products/:id`.
  - D1 columns: `products.image_url` (primary URL) and `products.image_urls_json` (array JSON).
- Where product images render:
  - Storefront: `src/components/ProductCard.tsx`, `src/pages/ShopPage.tsx`, `src/pages/ProductDetailPage.tsx`.
  - Cart/checkout: `src/components/cart/CartDrawer.tsx`, `src/pages/CheckoutPage.tsx`, `src/pages/CheckoutReturnPage.tsx`.
  - Admin: `src/components/admin/AdminShopTab.tsx`, `src/components/admin/AdminSoldTab.tsx`, `src/components/admin/OrderDetailsModal.tsx`.
  - Emails: `functions/_lib/emailTemplates.ts`, `functions/_lib/orderConfirmationEmail.ts`, `functions/_lib/ownerNewSaleEmail.ts`.

### B) Gallery images
- Frontend upload components:
  - `src/components/admin/AdminGalleryTab.tsx` uploads files to R2 (scope `gallery`) and stores returned URLs in local state.
  - Save invoked from `src/pages/AdminPage.tsx` calling `saveGalleryImages()`.
- Endpoint called:
  - Uploads: `POST /api/admin/images/upload?scope=gallery`.
  - Save: `PUT /api/gallery` (also accepts `POST`).
  - Payload: `{ images: GalleryImage[] }` where each image contains `id`, `imageUrl` (or `url`), `alt`, `hidden`, `position`, `createdAt`.
- Backend handler:
  - `functions/api/gallery.ts`.
  - Normalizes to `url` from `imageUrl` or `url`.
  - Deletes and re-inserts all rows on save.
- Storage result:
  - D1 table `gallery_images` stores `url` and `image_url` (same value), plus metadata.
  - Server rejects data URLs and long URLs.
- Where gallery images render:
  - Public gallery: `src/pages/GalleryPage.tsx` via `useGalleryImages()`.
  - Unused component for a strip: `src/components/HeroGalleryStrip.tsx` (not referenced in pages).

### C) Hero image / homepage images / custom orders images
- Frontend upload components:
  - `src/components/admin/AdminHomeTab.tsx` uploads files to R2 (scope `home`) for:
    - Hero collage images (3 slots).
    - Custom orders images (4 slots).
- Storage:
  - D1 `site_content` table via `/api/admin/site-content` (key `home`).
  - Public read via `/api/site-content`.
- Where images render:
  - Hero: `src/components/HomeHero.tsx`.
  - Custom orders grid: `src/pages/HomePage.tsx` (falls back to `/public/images/custom-*.jpg` if none).

### D) Category card images (home category tiles)
- Frontend upload components:
  - `src/components/admin/ShopCategoryCardsSection.tsx` and `src/components/admin/CategoryCardEditor.tsx`.
  - Uploads to R2 (scope `categories`) and saves returned URLs.
- Endpoint called:
  - Uploads: `POST /api/admin/images/upload?scope=categories`.
  - `PUT /api/admin/categories?id=<categoryId>` with JSON `{ heroImageUrl: <url> }` or `{ imageUrl: <url> }`.
- Backend handler:
  - `functions/api/admin/categories.ts`.
- Storage result:
  - D1 table `categories.image_url` and `categories.hero_image_url` store the URL.
- Where images render:
  - Home category tiles: `src/pages/HomePage.tsx` (uses `heroImageUrl || imageUrl || tile.imageUrl`).

### E) Contact form uploads (user images)
- Frontend upload component:
  - `src/components/ContactForm.tsx` reads a single file into a data URL and posts it to `/api/messages`.
- Endpoint called:
  - `POST /api/messages` with JSON `{ name, email, message, imageUrl? }`.
- Backend handler:
  - `functions/api/messages.ts` stores `image_url` in D1 and attaches the image to the email via Resend.
- Storage result:
  - D1 table `messages.image_url` stores the data URL.
  - Email attachments are base64; no external storage.
- Where images render:
  - Admin messages: `src/components/admin/AdminMessagesTab.tsx`.

### F) Other image sources (not uploads)
- Static assets in `public/images/*` (logo, category placeholder, custom order fallbacks).
- Hard-coded remote images in `src/pages/HomePage.tsx` and `src/pages/AboutPage.tsx`.

## Routes Table (Image-Related)
| Route | Methods | Auth | Handler | Required env/bindings | Request payload | Response shape |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/images/upload` | POST, OPTIONS, GET | None | `functions/api/admin/images/upload.ts` | `IMAGES_BUCKET` (R2 binding), `PUBLIC_IMAGES_BASE_URL` | `multipart/form-data` with `file` (optional `scope=products|gallery|home|categories`) | `{ id, url, fingerprint }` or error JSON |
| `/api/admin/upload-image` (unused) | POST | None | `functions/api/admin/upload-image.ts` | None | `multipart/form-data` with `file` (supports multiple) | `{ urls: string[] }` |
| `/api/admin/products` | GET, POST, DELETE | None | `functions/api/admin/products.ts` | `DB` (D1), optional `STRIPE_SECRET_KEY` | JSON new product | `{ products }` or `{ product }` |
| `/api/admin/products/:id` | PUT, DELETE | None | `functions/api/admin/products/[id].ts` | `DB` (D1) | JSON partial update (rejects data URLs) | `{ product }` or `{ success }` |
| `/api/gallery` | GET, PUT, POST | None | `functions/api/gallery.ts` | `DB` (D1) | `{ images: GalleryImage[] }` | `{ ok, count, images }` |
| `/api/admin/categories` | GET, POST, PUT, DELETE | None | `functions/api/admin/categories.ts` | `DB` (D1) | JSON partial category | `{ categories }` or `{ category }` |
| `/api/categories` | GET | None | `functions/api/categories.ts` | `DB` (D1) | None | `{ categories }` |
| `/api/messages` | POST | None | `functions/api/messages.ts` | `DB` (D1), email env | `{ name, email, message, imageUrl? }` | `{ success, id, createdAt }` |
| `/api/admin/messages` | GET | None | `functions/api/admin/messages.ts` | `DB` (D1) | None | `{ messages }` |
| `/api/admin/site-content` | GET, PUT | None | `functions/api/admin/site-content.ts` | `DB` (D1) | `{ key: 'home', json: <object> }` | `{ key, json }` |
| `/api/site-content` | GET | None | `functions/api/site-content.ts` | `DB` (D1) | None | `{ heroImages, customOrderImages, heroRotationEnabled? }` |

Notes on routing:
- Cloudflare Pages Functions use file-system routing under `functions/api/*`. For example, `functions/api/admin/images/upload.ts` maps to `/api/admin/images/upload` and `functions/api/admin/products/[id].ts` maps to `/api/admin/products/:id`.

## Where Images Are Stored Today
- R2: `IMAGES_BUCKET` (product uploads) + `PUBLIC_IMAGES_BASE_URL` for public URLs.
- D1 tables:
  - `products.image_url`, `products.image_urls_json` (product URLs).
  - `gallery_images.url`, `gallery_images.image_url` (public URLs).
  - `categories.image_url`, `categories.hero_image_url` (public URLs).
  - `messages.image_url` (data URL from contact form).
- `site_content` table (home hero + custom order images as URLs).
- Browser localStorage only:
  - `shop-category-tiles` (tile layout and fallback imageUrl values).
- Static assets: `public/images/*`.
- Remote URLs: hard-coded assets in `src/pages/HomePage.tsx` and `src/pages/AboutPage.tsx`.

## DB Audit (D1)
- `products` table:
  - `image_url` (primary image URL).
  - `image_urls_json` (JSON array of URLs).
- `gallery_images` table:
  - `url`, `image_url`, `alt_text`, `hidden`, `is_active`, `sort_order`, `position`, `created_at`.
- `categories` table:
  - `image_url`, `hero_image_url`, `show_on_homepage`.
- `messages` table:
  - `image_url` (data URL from contact form).
- `site_content` table:
  - `key`, `json`, `updated_at` (home hero + custom order image URLs).
- Migrations:
  - `db/migrations/live_init.sql` creates `gallery_images`, `categories`, and product image columns.
  - `db/schema.sql` includes `products` and `messages` image columns but not `gallery_images` or `categories`.
  - `db/migrations/20251230_home_content.sql` creates `site_content`.

## Env Var Audit
Image upload and image usage rely on the following:
- Product uploads (R2):
  - `IMAGES_BUCKET` (R2 binding, used in `functions/api/admin/images/upload.ts`).
  - `PUBLIC_IMAGES_BASE_URL` (public URL base for R2 object keys).
- Cloudflare Images (not wired, debug only):
  - `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_API_TOKEN`, `CLOUDFLARE_IMAGES_VARIANT` (used only in `functions/api/_debug/env.ts`).
- Contact form image email pipeline:
  - `RESEND_API_KEY`, `RESEND_OWNER_TO` or `EMAIL_OWNER_TO`, `RESEND_FROM`/`EMAIL_FROM`, optional `PUBLIC_SITE_URL` or `VITE_PUBLIC_SITE_URL` (used in `functions/_lib/email.ts` and `functions/api/messages.ts`).
- D1 bindings:
  - `DB` for all D1-backed routes (products, categories, gallery, messages).

Mismatches / gaps:
- `wrangler.toml` does not define an R2 binding or Cloudflare Images binding.
- `.env.example` does not mention `IMAGES_BUCKET`, `PUBLIC_IMAGES_BASE_URL`, or Resend envs.
- `.env` appears to be from an older Supabase setup and does not align with current Pages Functions env usage.

## Current R2 Storage Consolidation
- Products, gallery, hero/custom orders, and categories all upload via `/api/admin/images/upload` with scoped folders.
- All admin-uploaded image references stored in D1 are URLs (no data URLs) except contact form images.
- Public homepage reads `site_content` via `/api/site-content`; admin updates via `/api/admin/site-content`.

## Risks / Missing Pieces
- Admin endpoints have no server-side auth; admin login is client-only (`src/lib/auth.ts`).
- Contact form attachments are stored as data URLs in D1 and emailed; no persistent file storage.
- `functions/api/admin/upload-image.ts` is a stub and unused; could be removed or aligned with the real pipeline.
- R2 binding is configured in Cloudflare (not in `wrangler.toml`), but `PUBLIC_IMAGES_BASE_URL` is now documented in `.env.example`.

## Operational Notes (R2 Uploads)
- Upload scopes: `products`, `gallery`, `home`, `categories` map to `chesapeake-shell/<scope>/YYYY/MM/`.
- Gallery, category, and home content endpoints reject `data:` URLs.
- `site_content` stores JSON for `home` in D1, keeping hero/custom order images persistent across devices.

## Deployment Checklist (Images)
- Bind D1 as `DB` in Cloudflare Pages/Functions.
- Configure `IMAGES_BUCKET` (R2 binding) + `PUBLIC_IMAGES_BASE_URL` for all admin uploads (products/gallery/home/categories).
- Configure Resend email envs for contact form attachments (`RESEND_API_KEY`, `RESEND_OWNER_TO` or `EMAIL_OWNER_TO`, `RESEND_FROM` or `EMAIL_FROM`).

## Open Questions / Unknowns
- Should contact form images be stored in Cloudflare Images or kept as email-only attachments?
- Is there a requirement to preserve existing data URLs in D1, or can they be migrated and deleted?
- Do we want to keep R2 as a fallback during migration, or cut over to Cloudflare Images only?
- What is the target image variant naming scheme for MV Cloudflare Images?
- Should admin routes enforce auth on the server (not just client-side)?
