# Image Rendering + URL Audit
## TL;DR
- Shop grid renders ProductCard items via ProductGrid, each card uses ProgressiveImage with `src={product.imageUrl || product.imageUrls?.[0]}` inside an aspect-square wrapper and `object-cover`.
- Product image URLs are normalized on the server to `/images/<storageKey>` when they match `/images/*` or `chesapeake-shell/*`, while non-matching http(s) URLs pass through unchanged.
- `/api/products` and `/api/products/[id]` assemble imageUrl/imageUrls from D1 columns `image_url`, `image_urls_json`, `primary_image_id`, and `image_ids_json`; sold custom orders use `custom_orders.image_url`.
- Gallery page uses ProgressiveImage for the main gallery grid (object-contain, aspect 4/3) and for the sold products grid (object-cover, aspect-square); the modal uses a raw `<img>` with object-contain.
- `/images/*` requests with `chesapeake-shell/` keys are served from R2 in `functions/_middleware.ts` with `Cache-Control: public, max-age=31536000, immutable`; other `/images/*` fall through to static handling.

## (1) Shop thumbnails ? where rendered
Shop thumbnails are rendered by `src/components/ProductGrid.tsx` mapping products into `ProductCard`, and `ProductCard` passes the product image into `ProgressiveImage`. The grid size is dynamic: it renders one image per `products` entry and uses a 2- or 4-column layout depending on breakpoints.

Evidence: `src/components/ProductGrid.tsx`
```tsx
export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No products found</p>
      </div>
    );
  }

  return (
    <div className="product-grid grid gap-6 grid-cols-2 landscape:grid-cols-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

Evidence: `src/components/ProductCard.tsx`
```tsx
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {product.oneoff && inCart && (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-white/90 text-slate-900 border border-slate-200 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur">
            In Your Cart
          </span>
        )}
        <Link
          to={productHref}
          aria-label={`View ${product.name}`}
          className="block h-full w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          {product.imageUrl || product.imageUrls?.[0] ? (
            <ProgressiveImage
              src={product.imageUrl || product.imageUrls?.[0]}
              alt={product.name}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              No image
            </div>
          )}
        </Link>
      </div>
      <div className="p-3">
```

Evidence: `src/pages/ShopPage.tsx`
```tsx
                  <div className="text-center mb-4">
                    <h2 className="text-3xl font-semibold tracking-wide text-gray-900 uppercase">
                      {title}
                    </h2>
                    {subtitle && (
                      <p className="mt-1 text-sm font-serif font-medium text-slate-700 uppercase">{subtitle}</p>
                    )}
                  </div>
                  <ProductGrid products={items} />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
```

## (2) Product image URL shapes ? what they look like
Product images are assembled in API handlers from D1 columns, then normalized. Shapes supported by normalization include:
- `/images/<storageKey>` (kept as-is)
- `chesapeake-shell/<storageKey>` (normalized to `/images/<storageKey>`)
- Absolute `http(s)` URLs with `/images/<key>` path (normalized to `/images/<key>`)
- Other absolute `http(s)` URLs (left unchanged, allowing external images)

DB fields involved: `products.image_url`, `products.image_urls_json`, `products.primary_image_id`, `products.image_ids_json`, plus `custom_orders.image_url` for sold items.

Evidence: `functions/api/products.ts`
```ts
    const { results } = await statement.all<ProductRow>();
    const products: Product[] = (results || []).map((row) => {
      const extraImages = row.image_urls_json ? safeParseJsonArray(row.image_urls_json) : [];
      const rawPrimary = row.image_url || extraImages[0] || '';
      const primaryImage = normalizeImageUrl(rawPrimary, context.request, context.env);
      const normalizedExtras = extraImages
        .map((url) => normalizeImageUrl(url, context.request, context.env))
        .filter(Boolean)
        .filter((url) => url !== primaryImage);
      const imageIds = row.image_ids_json ? safeParseJsonArray(row.image_ids_json) : [];

      return {
        id: row.id,
        stripeProductId: row.stripe_product_id || row.id, // placeholder until Stripe linkage is added
        stripePriceId: row.stripe_price_id || undefined,
        name: row.name ?? '',
        description: row.description ?? '',
        imageUrls: primaryImage ? [primaryImage, ...normalizedExtras] : normalizedExtras,
        imageUrl: primaryImage || normalizedExtras[0] || '',
        thumbnailUrl: primaryImage || undefined,
        primaryImageId: row.primary_image_id || undefined,
        imageIds,
```

Evidence: `functions/api/products.ts`
```ts
        const customOrders = (customResults || []).map((row) => {
          const displayId = row.display_custom_order_id || row.id;
          const name = displayId ? `Custom Order ${displayId}` : 'Custom Order';
          const imageUrl = row.image_url || '';
          return {
            id: `custom_order:${row.id}`,
            name,
            description: row.description || '',
            imageUrls: imageUrl ? [normalizeImageUrl(imageUrl, context.request, context.env)] : [],
            imageUrl: imageUrl ? normalizeImageUrl(imageUrl, context.request, context.env) : '',
            thumbnailUrl: imageUrl ? normalizeImageUrl(imageUrl, context.request, context.env) : undefined,
            type: 'Custom',
            category: 'Custom',
            categories: ['Custom'],
            collection: 'Custom Orders',
            oneoff: true,
            visible: true,
            isSold: true,
            priceCents: undefined,
```

Evidence: `functions/api/lib/images.ts`
```ts
export function buildImagesPublicUrl(storageKey: string, request: Request, env: ImagesEnv): string {
  const base =
    (env.PUBLIC_IMAGES_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  const normalizedBase = base.startsWith('http://')
    ? base.replace('http://', 'https://')
    : base;
  return `${normalizedBase}/images/${storageKey}`;
}

export function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/images/')) {
    return trimmed.replace(/^\/images\//, '');
  }
  if (trimmed.startsWith('chesapeake-shell/')) {
    return trimmed;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
```

Evidence: `functions/api/lib/images.ts`
```ts
export function normalizeImageUrl(
  value: string | null | undefined,
  request: Request,
  env: ImagesEnv
): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/images/')) return trimmed;
  const storageKey = extractStorageKey(trimmed);
  if (storageKey) return `/images/${storageKey}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return trimmed;
}
```

Evidence: `db/schema.sql`
```sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  description TEXT,
  price_cents INTEGER,
  category TEXT,
  image_url TEXT,
  -- Extended fields for inventory + Stripe wiring
  image_urls_json TEXT,
  is_active INTEGER DEFAULT 1,
  is_one_off INTEGER DEFAULT 1,
  is_sold INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 1,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  collection TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Runtime examples: NOT FOUND. I did not find any captured runtime API responses or logs in the repo. Searched `functions/api/*`, `src/lib/api.ts`, and `db/schema.sql` for image URL examples.

## (3) Gallery images ? where rendered
Gallery images are fetched from `/api/gallery` via `fetchGalleryImages`, normalized client-side, and rendered in `GalleryPage` using `ProgressiveImage`. The same page also renders a sold products grid with images from `fetchSoldProducts`.

Evidence: `src/lib/api.ts`
```ts
export async function fetchGalleryImages() {
  const response = await fetch('/api/gallery', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Gallery API responded with ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.images)) return [];
  return data.images.map((img: any, idx: number) => ({
    id: img.id || `gallery-${idx}`,
    imageUrl: normalizeImageUrl(img.imageUrl || img.image_url || ''),
    imageId: img.imageId || img.image_id || undefined,
    hidden: !!(img.hidden ?? img.is_active === 0),
    alt: img.alt || img.alt_text,
    title: img.title || img.alt || img.alt_text,
    position: typeof img.position === 'number' ? img.position : idx,
    createdAt: img.createdAt || img.created_at,
  }));
}
```

Evidence: `functions/api/gallery.ts`
```ts
function mapRowToImage(row: GalleryRow | null | undefined, _schema: SchemaInfo) {
  if (!row?.id) return null;
  const url = row.url || row.image_url;
  if (!url) return null;
  const hidden = row.hidden !== undefined && row.hidden !== null ? row.hidden === 1 : row.is_active === 0;
  const position = Number.isFinite(row.sort_order) ? (row.sort_order as number) : row.position ?? 0;
  return {
    id: row.id,
    imageUrl: url,
    imageId: row.image_id || undefined,
    alt: row.alt_text || undefined,
    title: row.alt_text || undefined,
    hidden,
    position,
    createdAt: row.created_at || undefined,
```

Evidence: `src/pages/GalleryPage.tsx`
```tsx
                <div className="gallery-grid grid grid-cols-2 lg:grid-cols-3 gap-6">
                  {galleryImages.map((item) => (
                    <div key={item.id} className="relative group cursor-pointer">
                      <div
                        className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        <ProgressiveImage
                          src={item.imageUrl}
                          alt={item.title || 'Gallery item'}
                          className="h-full w-full"
                          imgClassName="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    </div>
                  ))}
```

Evidence: `src/pages/GalleryPage.tsx`
```tsx
              {soldProducts.length > 0 && (
                <div className="sold-grid grid grid-cols-2 lg:grid-cols-3 gap-6">
                  {soldProducts.map((item) => (
                    <div key={item.id} className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div
                        className="relative aspect-square overflow-hidden bg-gray-100 cursor-pointer"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        {item.imageUrl ? (
                          <ProgressiveImage
                            src={item.imageUrl}
                            alt={getSoldCardTitle(item)}
                            className="h-full w-full"
                            imgClassName="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            No image
```

## (4) object-fit usage ? cover vs contain (by route)
Shop product cards, gallery grid, and home custom orders all rely on aspect-ratio wrappers and `ProgressiveImage` with `imgClassName` for object-fit. The `ProgressiveImage` component itself does not set `width` or `height` attributes.

- Shop product cards (`src/components/ProductCard.tsx`): `object-cover` inside `aspect-square` wrapper; no width/height attributes on `img`.
- Gallery grid (`src/pages/GalleryPage.tsx`): `object-contain` inside `aspect-[4/3]` wrapper; sold products grid uses `object-cover` in `aspect-square`.
- Home custom orders (`src/pages/HomePage.tsx`): `object-cover` inside `aspect-[4/5]` / `sm:aspect-square` wrapper.

Evidence: `src/components/ui/ProgressiveImage.tsx`
```tsx
  return (
    <span className={wrapperClass}>
      <span
        aria-hidden="true"
        className={`absolute inset-0 bg-slate-100 transition-opacity duration-300 ${
          isLoaded ? 'opacity-0' : 'opacity-100 animate-pulse'
        }`}
      />
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
        className={`block ${imgClassName || ''} transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`.trim()}
```

Evidence: `src/components/ProductCard.tsx`
```tsx
          {product.imageUrl || product.imageUrls?.[0] ? (
            <ProgressiveImage
              src={product.imageUrl || product.imageUrls?.[0]}
              alt={product.name}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              No image
            </div>
          )}
```

Evidence: `src/pages/GalleryPage.tsx`
```tsx
                      <div
                        className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        <ProgressiveImage
                          src={item.imageUrl}
                          alt={item.title || 'Gallery item'}
                          className="h-full w-full"
                          imgClassName="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
```

Evidence: `src/pages/HomePage.tsx`
```tsx
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {customImagesToShow.map((img, idx) => (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-2xl shadow-md border border-slate-100"
                  >
                    <div className="relative aspect-[4/5] sm:aspect-square bg-slate-100">
                      <ProgressiveImage
                        src={img.imageUrl}
                        alt={img.alt || 'Custom hand-painted oyster shell art'}
                        className="absolute inset-0"
                        imgClassName="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
```

## (5) /images origin + caching ? how images are served
`/images/*` requests are handled by `functions/_middleware.ts` only when the storage key starts with `chesapeake-shell/`. Those requests are served from R2 (IMAGES_BUCKET) with long-lived caching headers. Other `/images/*` paths fall through to normal Pages/static handling. There is no explicit rewriting of external image URLs in middleware; normalization functions only convert known patterns to `/images/<key>` or leave external URLs intact.

Evidence: `functions/_middleware.ts`
```ts
export async function onRequest(context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/images/')) {
    return context.next();
  }

  const method = context.request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, 405);
  }

  if (!storageKey) {
    return json({ ok: false, code: 'MISSING_KEY', message: 'Image key is required' }, 400);
  }

  if (!storageKey.startsWith('chesapeake-shell/')) {
    return context.next();
  }

  if (!context.env.IMAGES_BUCKET) {
    console.error('[images/middleware] missing IMAGES_BUCKET binding');
    return json({ ok: false, code: 'MISSING_R2', message: 'Missing IMAGES_BUCKET binding' }, 500);
  }

  try {
    const object = await context.env.IMAGES_BUCKET.get(storageKey);
    if (!object) {
      return json({ ok: false, code: 'NOT_FOUND', message: 'Image not found' }, 404);
    }

    const headers = new Headers();
    const contentType = object.httpMetadata?.contentType || guessContentType(storageKey);
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
```

Evidence: `src/lib/images.ts`
```ts
export function normalizeImageUrl(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/images/')) return trimmed;
  if (trimmed.startsWith('chesapeake-shell/')) return `/images/${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/images\/(.+)$/);
      if (match?.[1]) return `/images/${match[1]}`;
      const idx = url.pathname.indexOf('/chesapeake-shell/');
      if (idx >= 0) return `/images/${url.pathname.slice(idx + 1)}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
```

## Gaps / Unknowns
- Actual runtime product image URLs from production API responses are NOT FOUND in this repo; no captured payloads or logs.
- The value of `PUBLIC_IMAGES_BASE_URL` in production is unknown (not present in repo); this affects absolute URL generation.
- R2 object key patterns beyond `chesapeake-shell/` and whether any public/static `/images/*` assets are served outside middleware are not verifiable from code alone.
- The actual number of products per shop section at runtime depends on data in D1 and cannot be inferred from code.

## Recommended next steps (no code changes)
- Pull a small sample of `/api/products` and `/api/products/[id]` responses from prod/staging to confirm real URL shapes and frequency of external URLs.
- Confirm `PUBLIC_IMAGES_BASE_URL` and R2 storage key conventions in the Pages/Workers environment to validate `/images/<key>` routing behavior.
- Inspect the D1 `images` and `products` tables for `public_url`, `image_url`, and `image_urls_json` values to verify current data consistency.
- Capture real response headers for `/images/<key>` and any CDN caching rules to ensure cache behavior matches expectations.
