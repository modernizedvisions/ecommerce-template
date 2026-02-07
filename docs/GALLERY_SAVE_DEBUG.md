# Gallery Save Debug Report

## Summary
Client-side validation in `AdminPage` blocks saving if **any** gallery item has a `url` starting with `blob:` or `data:`. The upload flow in `AdminGalleryTab` correctly replaces `url` with the R2 URL after upload, so the most likely reason the error persists is **one or more existing gallery items in state still have legacy data URLs** (from previous storage) that never got reuploaded. This triggers the `hasInvalid` check **before** `PUT /api/gallery` runs.

## Where the error is thrown
File: `src/pages/AdminPage.tsx`
Function: inline `onSave` handler passed to `AdminGalleryTab`

```ts
const hasPending = galleryImages.some((img) => img.isUploading);
const hasErrors = galleryImages.some((img) => img.uploadError);
const missingUrl = galleryImages.some((img) => !img.url);
const hasInvalid = galleryImages.some((img) => img.url?.startsWith('blob:') || img.url?.startsWith('data:'));
if (hasPending) throw new Error('Gallery images are still uploading.');
if (hasErrors) throw new Error('Fix failed gallery uploads before saving.');
if (missingUrl) throw new Error('Some images havenƒ?Tt finished uploading.');
if (hasInvalid) throw new Error('Gallery images must be uploaded first (no blob/data URLs).');
```

## Gallery item state shape
File: `src/components/admin/AdminGalleryTab.tsx`
Type: `AdminGalleryItem`

```ts
export type AdminGalleryItem = {
  id: string;
  url: string | null;       // persisted URL expected here
  previewUrl?: string | null; // blob or persisted URL used for display
  alt?: string;
  hidden?: boolean;
  position?: number;
  createdAt?: string;
  isUploading?: boolean;
  uploadError?: string | null;
  file?: File;
};
```

## Upload flow (state updates)
File: `src/components/admin/AdminGalleryTab.tsx`
Function: `handleAddImages` -> `runUploads`

- **On select**: `url` is set to `null`, `previewUrl` is a `blob:` URL.
- **On upload success**: `url` is set to the returned R2 URL; `previewUrl` is also set to the same URL.

```ts
const queued: AdminGalleryItem[] = selected.map((file) => ({
  id: crypto.randomUUID(),
  url: null,
  previewUrl: URL.createObjectURL(file),
  isUploading: true,
  file,
  ...
}));

// On success
onChange((prev) =>
  prev.map((entry) =>
    entry.id === img.id
      ? {
          ...entry,
          url: result.url,
          previewUrl: result.url,
          isUploading: false,
          uploadError: undefined,
          file: undefined,
        }
      : entry
  )
);
```

## Upload helper return shape
File: `src/lib/api.ts`
Function: `adminUploadImageScoped`

- Uses `await response.json()` and returns `{ id: data.id, url: data.url }`.
- This appears correct and **should** produce a real `https://...` URL.

```ts
data = await response.json();
if (!data?.id || !data?.url) throw new Error('...missing-fields...');
return { id: data.id, url: data.url };
```

## Why validation still fails
Given the above, `hasInvalid` is only true when **some `galleryImages[i].url` starts with `blob:` or `data:`**.

The upload path **replaces `url` with the R2 URL** and does **not** set `url` to a blob/data URL, so the likely source of `hasInvalid` is **existing gallery items loaded from D1 that already contain data URLs**.

That matches the symptom: uploads succeed, but Save still fails because another item in `galleryImages` remains a legacy data URL. The error is thrown **before** `PUT /api/gallery`, so the request never fires.

## Most likely causes (ranked)
1) **Legacy data URLs already in D1** are loaded into `galleryImages` and trigger `hasInvalid` on save.
2) **Field mismatch** between `url` and `previewUrl` (less likely here — upload sets `url` correctly).
3) **Upload helper returns unexpected shape** (unlikely; it parses JSON and validates `url`).
4) **Stale state / different source of truth** (less likely; `AdminGalleryTab` uses parent state).
5) **Upload success not executed** (would typically hit `missingUrl` or `isUploading` error instead).

## Simplest fix (minimal patch)
- **Identify legacy data URLs and force re-upload**:
  - In `loadAdminData`, when mapping `galleryData`, if `img.imageUrl` starts with `data:`/`blob:`, set `url = null` and set `uploadError` (or a `needsMigration` flag) so the UI clearly shows which items must be re-uploaded.
  - This keeps the validation strict and prevents saving legacy data URLs, while making the error actionable.

Alternative minimal fix (not recommended, violates goal):
- Remove `hasInvalid` check — but this would allow data URLs to persist.

## Suggested debug logging (if you want to confirm at runtime)
Add logs (temporary) in these spots:

- After upload success in `AdminGalleryTab`:
```ts
console.log('[gallery] upload result', result);
console.log('[gallery] after upload set', { id: img.id, url: result.url, previewUrl: result.url });
```

- Before save in `AdminPage`:
```ts
console.log('[gallery] before save validate', galleryImages.map(i => ({ id: i.id, url: i.url, previewUrl: i.previewUrl })));
```

This will show if any `url` values still begin with `data:`/`blob:`.

## PUT /api/gallery status
Based on code path, **`PUT /api/gallery` is not reached** when `hasInvalid` is true. The error occurs in `AdminPage` before `saveGalleryImages()` runs.

---

## Key Findings (short summary)
- Validation is in `src/pages/AdminPage.tsx` and checks `galleryImages[i].url` for `blob:`/`data:`.
- Upload success in `AdminGalleryTab` sets `url` to the R2 URL correctly.
- The most likely reason the error persists is **legacy data URLs already stored in D1** and loaded into state.
- Minimal fix: flag legacy entries on load and require re-upload; keep `hasInvalid` check.
