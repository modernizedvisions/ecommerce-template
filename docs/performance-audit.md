# Performance Audit — The Chesapeake Shell (React + Vite + TS on Cloudflare Pages)

## A) Executive Summary

### What users experience + top 3 likely causes
- **Shop/product images feel slow** because images are loaded as raw URLs without responsive variants (`srcset/sizes`) and often pulled at full resolution for grid thumbnails. This increases bandwidth and delays first paint for the shop grid and sold products.
- **Main thread work and render delays** due to multiple image grids rendering simultaneously (home, gallery, sold products) and the ProgressiveImage overlay waiting for `onLoad` before full opacity. Large image decode time can make content feel blank for seconds.
- **Non-critical embeds** (TikTok/Instagram) add extra network requests and main-thread work on the Home page, competing with image downloads.

### Fast wins (low risk)
- Add responsive image sizing hints (`sizes`) and use smaller variants for thumbnails (if available).
- Ensure non-critical embeds are lazy or after-interaction.
- Adjust ProgressiveImage behavior to avoid delays when cached images are already loaded.

### Medium effort
- Generate and use thumbnail variants (via R2 or Cloudflare Images) for product grids and gallery.
- Reduce initial image count (pagination or load more) for shop and gallery grids.

### High effort / risky
- Deep refactors: virtualization for large grids, full image pipeline migration, or redesign of image storage.

---

## B) Current Load Map (per route)

### Home (`src/pages/HomePage.tsx`)
- **Initial JS/CSS**: main bundle + shared components; home uses `HomeHero`, `TikTokEmbed`, `ProgressiveImage`.
- **API calls**:
  - `fetchCategories()` ? `/api/categories`
  - `fetchShopCategoryTiles()` ? localStorage
  - `getPublicSiteContentHome()` ? `/api/site-content`
- **Images**:
  - Hero image(s) from site content.
  - Custom orders grid (4 images) from site content or fallback assets in `/public/images`.
  - Category card images from category `heroImageUrl` or `imageUrl`.
- **Embeds**: TikTok embed component loads external script.

**Code snippets (Home):**

Home data fetches and hero content:
```tsx
// src/pages/HomePage.tsx
useEffect(() => {
  loadCategories();
  loadTiles();
  loadHeroImages();
}, []);

const loadHeroImages = async () => {
  const content = await getPublicSiteContentHome();
  setHomeContent(content || {});
  const { hero, customOrders, rotation } = normalizeHomeContent(content);
  setCustomOrderImages(customOrders);
  setHeroImages(hero);
  setHeroRotationEnabled(rotation);
};
```

Custom orders image grid (loads 4 images):
```tsx
// src/pages/HomePage.tsx
{customImagesToShow.map((img, idx) => (
  <div key={idx} className="overflow-hidden rounded-2xl shadow-md border border-slate-100">
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
  </div>
))}
```

### Shop (`src/pages/ShopPage.tsx`)
- **API calls**: `fetchProducts()` and `fetchCategories()` on load.
- **Images**: Product cards rendered via `ProductGrid` (no `srcset` in codebase).

**Code snippet (Shop data load):**
```tsx
// src/pages/ShopPage.tsx
useEffect(() => {
  loadProducts();
}, []);

const loadProducts = async () => {
  const allProducts = await fetchProducts({ visible: true });
  const availableProducts = (allProducts || []).filter((p) => !p.isSold);
  setProducts(availableProducts);
  const apiCategories = await fetchCategories();
  setCategories(orderCategorySummaries(dedupeCategories(apiCategories)));
};
```

### Product detail (`src/pages/ProductDetailPage.tsx`)
- **API calls**: `fetchProductById()` and `fetchRelatedProducts()`.
- **Images**: Main hero image loads first; thumbnails via `ProgressiveImage`.

**Code snippet (Product detail image usage):**
```tsx
// src/pages/ProductDetailPage.tsx
<div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
  {loadingProduct ? (
    <div className="w-full h-full animate-pulse bg-gray-200" />
  ) : images.length ? (
    <img
      src={images[currentIndex]}
      alt={product?.name || 'Product'}
      className="w-full h-full object-cover"
      decoding="async"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
  )}
</div>
```

### Gallery (`src/pages/GalleryPage.tsx`)
- **API calls**: `useGalleryImages()` and `fetchSoldProducts()`.
- **Images**: Gallery grid + sold products grid (both use `ProgressiveImage`).

**Code snippet (Gallery grids):**
```tsx
// src/pages/GalleryPage.tsx
<div className="gallery-grid grid grid-cols-2 lg:grid-cols-3 gap-6">
  {galleryImages.map((item) => (
    <div key={item.id} className="relative group cursor-pointer">
      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
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
</div>
```

### Cart/Checkout (public)
- **Code splitting** is in `src/main.tsx` (checkout and admin routes are lazy-loaded).

**Code snippet (routes):**
```tsx
// src/main.tsx
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const CheckoutReturnPage = lazy(() => import('./pages/CheckoutReturnPage').then((m) => ({ default: m.CheckoutReturnPage })));
```

---

## C) Bundle Audit

### Vite config
- No custom chunking or compression config beyond default.

**Code snippet:**
```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') }, preserveSymlinks: true },
  optimizeDeps: { exclude: ['lucide-react'] },
});
```

### Code splitting status
- `AdminPage`, `CheckoutPage`, `CheckoutReturnPage` are lazily loaded (`src/main.tsx`).
- Other pages are bundled in main (Home, Shop, Gallery, Product detail, About, Terms, Privacy).

---

## D) Image Audit (deep dive)

### Image origin and serving
- Images are stored in R2 and served via `/images/<storageKey>` with long-lived cache headers.

**Code snippet (middleware):**
```ts
// functions/_middleware.ts
headers.set('Cache-Control', 'public, max-age=31536000, immutable');
return new Response(method === 'HEAD' ? null : object.body, { status: 200, headers });
```

### Client-side image rendering
- Images use `ProgressiveImage` which shows a placeholder until `onLoad` and then fades in.

**Code snippet (ProgressiveImage):**
```tsx
// src/components/ui/ProgressiveImage.tsx
<span className={wrapperClass}>
  <span aria-hidden="true" className={`absolute inset-0 bg-slate-100 transition-opacity duration-300 ${isLoaded ? 'opacity-0' : 'opacity-100 animate-pulse'}`} />
  <img
    src={src}
    alt={alt}
    loading={loading}
    decoding={decoding}
    fetchPriority={fetchPriority}
    onLoad={() => setIsLoaded(true)}
    onError={() => setIsLoaded(true)}
    className={`block ${imgClassName || ''} transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`.trim()}
  />
</span>
```

### Why shop images feel slow
- No `srcset`/`sizes` ? full-size downloads for thumbnails.
- No explicit `width/height` attributes ? CLS risk and delayed layout.
- Many images load simultaneously on Shop/Gallery.

---

## E) Network & Caching Audit

- `/images/*` served from R2 via middleware with `Cache-Control: public, max-age=31536000, immutable`.
- Static assets (Vite) are fingerprinted and cacheable by default.
- `/api/*` calls are `no-store` for some endpoints (e.g., gallery), and not cached.

---

## F) Prioritized Laggards (Top 10)

1) **Shop grid images load full-size**
   - **Where**: `src/pages/ShopPage.tsx`, `src/components/ProductGrid.tsx` (image rendering)
   - **Why**: no `srcset` or thumbnail URLs.
   - **Fix idea**: add thumbnail URLs or `sizes` hints.
   - **Risk**: Low/Med.
   - **Test**: throttle network; measure time to first thumbnail.

2) **Gallery page loads two large grids**
   - **Where**: `src/pages/GalleryPage.tsx`
   - **Why**: many images per route, no pagination.
   - **Fix idea**: limit initial count or load-more.
   - **Risk**: Med.

3) **Hero image is eager**
   - **Where**: `src/components/HomeHero.tsx`
   - **Why**: large hero loads early; competes with grid images.
   - **Fix idea**: preload only first hero image, or optimize size.
   - **Risk**: Med.

4) **ProgressiveImage opacity delay**
   - **Where**: `src/components/ui/ProgressiveImage.tsx`
   - **Why**: waits for `onLoad` to show, perceived blank.
   - **Fix idea**: reduce fade delay for cached images.
   - **Risk**: Low.

5) **TikTok embed loads on Home**
   - **Where**: `src/components/TikTokEmbed.tsx`
   - **Why**: external script + polling.
   - **Fix idea**: lazy-load after interaction.
   - **Risk**: Low.

6) **No explicit image dimensions**
   - **Where**: `HomePage`, `ShopPage`, `GalleryPage` image tags.
   - **Why**: CLS + layout shifts.
   - **Fix idea**: set `width`/`height` or rely on aspect wrappers consistently.
   - **Risk**: Low.

7) **Sold products grid on gallery**
   - **Where**: `src/pages/GalleryPage.tsx`
   - **Why**: extra images after gallery on same route.
   - **Fix idea**: defer sold grid after user interaction.
   - **Risk**: Low.

8) **Multiple below-the-fold sections on Home**
   - **Where**: `src/pages/HomePage.tsx`
   - **Why**: all sections render immediately.
   - **Fix idea**: lazy render below fold sections.
   - **Risk**: Low/Med.

9) **No thumbnails in D1 data**
   - **Where**: `products.image_url` / `image_urls_json` store raw URLs.
   - **Why**: heavy downloads for grid.
   - **Fix idea**: add thumbnail URL fields (no schema change in this phase, but planned).
   - **Risk**: Med.

10) **Admin chunk still large**
   - **Where**: `src/pages/AdminPage.tsx` imports many admin tabs.
   - **Why**: larger route chunk (not public-facing).
   - **Fix idea**: lazy import per tab if needed.
   - **Risk**: Low.

---

## G) Surgical Gameplan (phased)

### Phase 1 (lowest risk)
- Add `loading="lazy"` and `decoding="async"` to all non-hero images.
- Add `sizes` attributes to grid images (Home, Shop, Gallery).
- Lazy-load TikTok embed or defer until interaction.
- Ensure ProgressiveImage fade does not delay cached images.

### Phase 2 (medium)
- Introduce thumbnail URLs for product images (e.g., `thumbnailUrl`) and use in grids.
- Add basic pagination to gallery/sold products.

### Phase 3 (higher)
- Move to Cloudflare Images variants.
- Virtualize large grids if necessary.

---

## H) Measurement Plan

### What to measure
- LCP, CLS, INP on Home + Shop.
- Time to first image paint on Shop grid.
- JS bundle sizes and number of requests.

### How to measure
- Chrome DevTools Performance + Network throttling.
- Lighthouse (Mobile + Desktop).
- WebPageTest with 3G Fast and Cable profiles.

### Before/after checklist
- LCP under 2.5s on Home and Shop.
- CLS under 0.1.
- Shop grid first image paint under 2s on Fast 3G.
- No regression in hero image quality.

---

## Sources and Code Evidence

### Home page
- `src/pages/HomePage.tsx` (data fetch, hero content, custom orders grid)

### Shop page
- `src/pages/ShopPage.tsx` (fetch products + categories)

### Product detail
- `src/pages/ProductDetailPage.tsx` (main image + thumbnails)

### Gallery
- `src/pages/GalleryPage.tsx` (gallery grid + sold grid)

### Progressive image component
- `src/components/ui/ProgressiveImage.tsx`

### Hero and embeds
- `src/components/HomeHero.tsx`
- `src/components/TikTokEmbed.tsx`

### Image middleware
- `functions/_middleware.ts`

### API entry points
- `src/lib/api.ts`

### Route code splitting
- `src/main.tsx`

---

This report is based on current repo code and image pipeline behavior; no code changes were made.
