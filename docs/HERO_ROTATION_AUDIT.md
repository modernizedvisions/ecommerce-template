# Hero Rotation Audit Report

## Scope
Audit of hero rotation wiring (admin → API → D1 → public hero) and current rotation logic behavior.

## Hero render + rotation logic
**File:** `src/components/HomeHero.tsx`  
**Behavior:** Uses `HeroSlideshow` when `heroImages.length > 1` **and** `heroRotationEnabled` is true. Otherwise shows the first available image.

```ts
{heroImages.length > 1 && heroRotationEnabled ? (
  <HeroSlideshow
    images={heroImages.map((img, idx) => ({
      id: img.id || `hero-${idx}`,
      imageUrl: img.imageUrl,
      title: img.alt,
    }))}
    intervalMs={7000}
  />
) : heroImage ? (
  <img src={heroImage.imageUrl} ... />
) : (...)}
```

**Rotation implementation:** `src/components/HeroSlideshow.tsx`
- Filters slides with `imageUrl`.
- `setInterval` advances index.
- Uses **translateX** to slide; no scaling.
- Pauses on hover; respects reduced motion and tab visibility.

```ts
const slides = useMemo(() => (images || []).filter((img) => img?.imageUrl), [images]);
const hasMultiple = slides.length > 1;
...
if (!hasMultiple || paused || prefersReducedMotion || isDocumentHidden) return;
const timer = window.setInterval(() => {
  setIndex((current) => (current + 1) % slides.length);
}, intervalMs);
```

Transition style (slide):
```ts
const trackStyle = {
  transform: `translateX(-${index * 100}%)`,
  transition: prefersReducedMotion ? 'none' : 'transform 600ms ease-in-out',
};
```

## Admin hero settings
**File:** `src/components/admin/AdminHomeTab.tsx`
- Uploads hero images (3 slots) via `adminUploadImageScoped(file, { scope: 'home' })`.
- Toggle: “Rotate Hero Images” checkbox.
- Persistence: `updateAdminSiteContentHome(payload)` with `heroRotationEnabled`.

```ts
const payload = buildSiteContent(heroImages, customOrdersImages, heroRotationEnabled);
await updateAdminSiteContentHome(payload);
```

**Stored JSON keys** (site content):
```ts
return { heroImages, customOrderImages, heroRotationEnabled };
```
Where `heroImages` is `{ left, middle, right }`.

## Public data flow (end-to-end)
- Admin UI: `AdminHomeTab` → `updateAdminSiteContentHome`  
  **Route:** `PUT /api/admin/site-content`
- D1: `site_content` table (`key='home'`, `json` column)
- Public fetch: `getPublicSiteContentHome` → `GET /api/site-content`
- Normalize: `normalizeHomeContent` in `src/pages/HomePage.tsx`
```ts
const { hero, customOrders, rotation } = normalizeHomeContent(content);
setHeroImages(hero);
setHeroRotationEnabled(rotation);
```
- Render: `HomeHero` → `HeroSlideshow`

## Likely failure mode (from code inspection)
Most likely **B/C**:
1) **Interval starts but uses a stale/insufficient slide list**  
   - `HomeHero` condition only checks `heroImages.length > 1`, not the **filtered** count of valid URLs.  
   - `normalizeHomeContent` can produce sparse arrays (e.g., only right image set → array length 3 with empty slots), which can still trigger `heroImages.length > 1` but result in **only 1 valid slide** after filtering in `HeroSlideshow`.
2) **IntervalMs mismatch**  
   - `HeroSlideshow` defaults to 3000ms, but `HomeHero` overrides with `intervalMs={7000}`. This may feel like “not rotating” if you expect 3 seconds.

## Temporary debug logs added (for verification)
1) **Hero data load** — `src/pages/HomePage.tsx`:
```ts
console.debug('[home hero] site content', {
  heroCount: hero.length,
  heroUrls: hero.map((img) => img?.imageUrl || ''),
  rotation,
});
```

2) **Rotation start + tick** — `src/components/HeroSlideshow.tsx`:
```ts
console.debug('[hero rotation] start interval', { count: slides.length, intervalMs });
console.debug('[hero rotation] tick', { from: index, to: (index + 1) % slides.length });
```

## Summary of findings
- Rotation is implemented in `HeroSlideshow` (slide transform) and only runs when `slides.length > 1`.
- `HomeHero` uses a **length check on the unfiltered array**, which can allow sparse arrays to pass.
- `HomeHero` currently sets `intervalMs={7000}`, not 3000.
- Toggle is stored in D1 `site_content.json.heroRotationEnabled` and is wired end‑to‑end.

## Most likely causes (ranked)
1) **Sparse hero image array** triggers slideshow with only 1 valid slide, so it never rotates.
2) **Interval set to 7000ms**, making rotation appear broken.
3) **Rotation toggle off / not persisted**, though code appears correct.
4) **Re-render resets index** (less likely; index resets only when slides length changes).
5) **CSS/transition expectations** (current slide uses translateX, not fade).
