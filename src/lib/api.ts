import {
  getActiveProducts,
  getProductById,
  getRelatedProducts,
  getSoldProducts,
} from './db/products';
import {
  fetchAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
} from './db/adminProducts';
import {
  fetchShopCategoryTiles as loadShopCategoryTiles,
  saveShopCategoryTiles as persistShopCategoryTiles,
} from './db/content';
import { getAdminOrders } from './db/orders';
import { getReviewsForProduct } from './db/reviews';
import { createEmbeddedCheckoutSession, fetchCheckoutSession } from './payments/checkout';
import { sendContactEmail } from './contact';
import { fetchAdminPromotions, createAdminPromotion, updateAdminPromotion, deleteAdminPromotion } from './adminPromotions';
import { fetchAdminPromoCodes, createAdminPromoCode, updateAdminPromoCode, deleteAdminPromoCode } from './adminPromoCodes';
import type { Category, HomeSiteContent } from './types';
import { normalizeImageUrl } from './images';
import { optimizeImageForUpload } from './imageOptimization';
import { adminFetch, notifyAdminAuthRequired } from './adminAuth';
import { isDemoAdmin } from './demoMode';
import * as adminClient from './adminClient';

const debugAdminImageUpload = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return;
  console.debug(...args);
};

const warnAdminImageUpload = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return;
  console.warn(...args);
};

// Aggregates the mock data layer and stubs so the UI can continue working while we
// prepare for Cloudflare D1 + Stripe with the site/admin as the source of truth.

export const fetchProducts = getActiveProducts;
export const fetchProductById = getProductById;
export const fetchRelatedProducts = getRelatedProducts;
export const fetchOrders = getAdminOrders;
export const fetchSoldProducts = getSoldProducts;
export const adminFetchProducts = fetchAdminProducts;
export const adminCreateProduct = createAdminProduct;
export const adminUpdateProduct = updateAdminProduct;
export const adminDeleteProduct = deleteAdminProduct;
export const fetchShopCategoryTiles = loadShopCategoryTiles;
export const saveShopCategoryTiles = persistShopCategoryTiles;
export const fetchReviewsForProduct = getReviewsForProduct;
// validateCart is no longer exported here (orders/cart validation will be wired separately if needed)

export { createEmbeddedCheckoutSession, fetchCheckoutSession, sendContactEmail };
export {
  fetchAdminPromotions,
  createAdminPromotion,
  updateAdminPromotion,
  deleteAdminPromotion,
  fetchAdminPromoCodes,
  createAdminPromoCode,
  updateAdminPromoCode,
  deleteAdminPromoCode,
};

export type UploadScope = 'products' | 'gallery' | 'home' | 'categories' | 'custom-orders';

export type CustomOrderExample = {
  id: string;
  imageUrl: string;
  imageId?: string | null;
  title: string;
  description: string;
  tags: string[];
  sortOrder?: number;
  isActive?: boolean;
};

export async function fetchGalleryImages() {
  if (isDemoAdmin()) {
    const images = await adminClient.listGalleryImages();
    return images.map((img: any, idx: number) => ({
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

export async function saveGalleryImages(images: any[]) {
  if (isDemoAdmin()) {
    return adminClient.saveGalleryImages(images);
  }
  const response = await adminFetch('/api/gallery', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ images }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.detail || data?.error || '';
    } catch {
      detail = '';
    }
    throw new Error(`Save gallery API responded with ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await response.json();
  return Array.isArray(data.images) ? data.images : [];
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const response = await fetch('/api/categories', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Categories API responded with ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.categories) ? (data.categories as Category[]) : [];
  } catch (error) {
    console.error('Failed to load categories from API', error);
    return [];
  }
}

const ADMIN_CATEGORIES_PATH = '/api/admin/categories';

export async function adminFetchCategories(): Promise<Category[]> {
  if (isDemoAdmin()) return adminClient.listCategories();
  const response = await adminFetch(ADMIN_CATEGORIES_PATH, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Admin categories fetch failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.categories) ? (data.categories as Category[]) : [];
}

export async function fetchCustomOrderExamples(): Promise<CustomOrderExample[]> {
  const response = await fetch('/api/custom-orders/examples', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Custom order examples API responded with ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.examples) ? (data.examples as CustomOrderExample[]) : [];
}

export async function adminFetchCustomOrderExamples(): Promise<CustomOrderExample[]> {
  if (isDemoAdmin()) return adminClient.listCustomOrderExamples() as Promise<CustomOrderExample[]>;
  const response = await adminFetch('/api/admin/custom-orders/examples', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Admin custom order examples fetch failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.examples) ? (data.examples as CustomOrderExample[]) : [];
}

export async function adminSaveCustomOrderExamples(examples: CustomOrderExample[]): Promise<CustomOrderExample[]> {
  if (isDemoAdmin()) return adminClient.saveCustomOrderExamples(examples as any) as Promise<CustomOrderExample[]>;
  const response = await adminFetch('/api/admin/custom-orders/examples', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ examples }),
  });
  if (!response.ok) throw new Error(`Admin custom order examples save failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.examples) ? (data.examples as CustomOrderExample[]) : [];
}

export async function adminCreateCategory(payload: {
  name: string;
  subtitle?: string;
  shippingCents?: number;
  sortOrder?: number;
  optionGroupLabel?: string | null;
  optionGroupOptions?: string[];
}): Promise<Category | null> {
  if (isDemoAdmin()) return adminClient.createCategory(payload as any);
  const response = await adminFetch(ADMIN_CATEGORIES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Create category failed: ${response.status}`);
  const data = await response.json();
  return (data as any).category ?? null;
}

export async function adminUpdateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  if (isDemoAdmin()) return adminClient.updateCategory(id, updates);
  const response = await adminFetch(`${ADMIN_CATEGORIES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Update category failed: ${response.status}`);
  const data = await response.json();
  return (data as any).category ?? null;
}

export async function adminDeleteCategory(id: string): Promise<void> {
  if (isDemoAdmin()) return adminClient.deleteCategory(id);
  const response = await adminFetch(`${ADMIN_CATEGORIES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Delete category failed: ${response.status}`);
}

export async function adminUploadImage(
  file: File,
  opts?: {
    onStatus?: (status: 'optimizing' | 'uploading') => void;
    entityType?: string;
    entityId?: string;
    kind?: string;
    isPrimary?: boolean;
    sortOrder?: number;
  }
): Promise<{
  id: string;
  url: string;
  imageId?: string | null;
  storageKey?: string;
  warning?: string;
}> {
  if (isDemoAdmin()) {
    opts?.onStatus?.('optimizing');
    opts?.onStatus?.('uploading');
    debugAdminImageUpload('[admin image upload] demo local mode (no network)', {
      scope: 'products',
      name: file.name,
      type: file.type,
      size: file.size,
    });
    return adminClient.uploadImage(file);
  }
  return adminUploadImageUnified(file, {
    scope: 'products',
    onStatus: opts?.onStatus,
    entityType: opts?.entityType,
    entityId: opts?.entityId,
    kind: opts?.kind,
    isPrimary: opts?.isPrimary,
    sortOrder: opts?.sortOrder,
  });
}

export async function adminUploadImageUnified(
  file: File,
  opts?: {
    scope?: UploadScope;
    onStatus?: (status: 'optimizing' | 'uploading') => void;
    entityType?: string;
    entityId?: string;
    kind?: string;
    isPrimary?: boolean;
    sortOrder?: number;
  }
): Promise<{
  id: string;
  url: string;
  imageId?: string | null;
  storageKey?: string;
  warning?: string;
}> {
  if (isDemoAdmin()) {
    opts?.onStatus?.('optimizing');
    opts?.onStatus?.('uploading');
    debugAdminImageUpload('[admin image upload] demo local mode (no network)', {
      scope: opts?.scope || 'products',
      name: file.name,
      type: file.type,
      size: file.size,
    });
    return adminClient.uploadImage(file);
  }
  const scope = opts?.scope || 'products';
  const maxDimension = scope === 'home' ? 2400 : 1600;
  const targetBytes = scope === 'home' ? 900 * 1024 : 500 * 1024;
  let uploadFile = file;

  debugAdminImageUpload('[admin image upload] C optimization started', {
    scope,
    name: file.name,
    type: file.type,
    size: file.size,
  });
  opts?.onStatus?.('optimizing');
  try {
    const optimized = await optimizeImageForUpload(file, {
      maxDimension,
      targetBytes,
      quality: 0.82,
    });
    uploadFile = optimized.file;
    debugAdminImageUpload('[admin image upload] D optimization finished', {
      scope,
      sourceName: file.name,
      sourceType: file.type,
      sourceBytes: file.size,
      optimizedName: uploadFile.name,
      optimizedType: uploadFile.type,
      optimizedBytes: uploadFile.size,
      didOptimize: optimized.didOptimize,
      usedType: optimized.usedType,
      hadAlpha: optimized.hadAlpha,
    });
  } catch (err) {
    console.error('[admin image upload] optimize failed', err);
    warnAdminImageUpload('[admin image upload] D optimization failed; fallback to original file', {
      scope,
      name: file.name,
      type: file.type,
      size: file.size,
      error: err instanceof Error ? err.message : String(err),
    });
    alert(
      'Image optimization failed. Uploading original file; large images may still fail.'
    );
  }
  opts?.onStatus?.('uploading');

  debugAdminImageUpload('[admin image upload] E upload start', {
    endpoint: '/api/admin/images/create-upload',
    scope,
    name: uploadFile.name,
    type: uploadFile.type,
    size: uploadFile.size,
  });
  const createResponse = await adminFetch('/api/admin/images/create-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      scope,
      filename: uploadFile.name || 'upload',
      contentType: uploadFile.type,
      sizeBytes: uploadFile.size,
      entityType: opts?.entityType,
      entityId: opts?.entityId,
      kind: opts?.kind,
      isPrimary: !!opts?.isPrimary,
      sortOrder: opts?.sortOrder,
    }),
  });

  let createData: any = null;
  try {
    createData = await createResponse.json();
  } catch {
    throw new Error('Create upload response was not valid JSON');
  }

  if (!createResponse.ok || createData?.ok === false) {
    const detail = createData?.detail || createData?.code || 'unknown';
    warnAdminImageUpload('[admin image upload] F create-upload failed', {
      scope,
      status: createResponse.status,
      detail,
    });
    throw new Error(`Image create-upload failed (${createResponse.status}): ${detail}`);
  }

  const imageId = createData?.image?.id as string | undefined;
  const storageKey = createData?.image?.storageKey as string | undefined;
  const createdPublicUrl = createData?.image?.publicUrl as string | undefined;
  const mode = createData?.mode as 'presigned' | 'server' | undefined;

  if (!imageId || !storageKey) {
    throw new Error('Create upload response missing image id/storage key');
  }

  if (mode === 'presigned' && createData?.upload?.url) {
    debugAdminImageUpload('[admin image upload] E presigned upload start', {
      scope,
      method: createData.upload.method || 'PUT',
      url: createData.upload.url,
      imageId,
      storageKey,
      size: uploadFile.size,
      type: uploadFile.type,
    });
    const uploadRes = await fetch(createData.upload.url, {
      method: createData.upload.method || 'PUT',
      headers: createData.upload.headers || { 'Content-Type': uploadFile.type },
      body: uploadFile,
    });

    if (!uploadRes.ok) {
      warnAdminImageUpload('[admin image upload] F presigned upload failed', {
        scope,
        status: uploadRes.status,
        imageId,
      });
      throw new Error(`Presigned upload failed (${uploadRes.status})`);
    }

    debugAdminImageUpload('[admin image upload] E finalize start', {
      endpoint: '/api/admin/images/finalize',
      scope,
      imageId,
    });
    const finalizeResponse = await adminFetch('/api/admin/images/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        imageId,
        entityType: opts?.entityType,
        entityId: opts?.entityId,
        kind: opts?.kind,
        isPrimary: !!opts?.isPrimary,
        sortOrder: opts?.sortOrder,
      }),
    });

    let finalizeData: any = null;
    try {
      finalizeData = await finalizeResponse.json();
    } catch {
      throw new Error('Finalize response was not valid JSON');
    }

    if (!finalizeResponse.ok || finalizeData?.ok === false) {
      const detail = finalizeData?.detail || finalizeData?.code || 'unknown';
      warnAdminImageUpload('[admin image upload] F finalize failed', {
        scope,
        status: finalizeResponse.status,
        detail,
        imageId,
      });
      throw new Error(`Finalize failed (${finalizeResponse.status}): ${detail}`);
    }

    const publicUrl = finalizeData?.image?.publicUrl || createdPublicUrl;
    debugAdminImageUpload('[admin image upload] F upload success', {
      scope,
      mode: 'presigned',
      imageId,
      publicUrl,
      storageKey: finalizeData?.image?.storageKey || storageKey,
    });
    return {
      id: imageId,
      url: normalizeImageUrl(publicUrl),
      imageId,
      storageKey: finalizeData?.image?.storageKey || storageKey,
    };
  }

  const form = new FormData();
  form.append('file', uploadFile, uploadFile.name || 'upload');
  form.append('imageId', imageId);
  if (opts?.entityType) form.append('entityType', opts.entityType);
  if (opts?.entityId) form.append('entityId', opts.entityId);
  if (opts?.kind) form.append('kind', opts.kind);
  if (opts?.isPrimary !== undefined) form.append('isPrimary', opts.isPrimary ? '1' : '0');
  if (opts?.sortOrder !== undefined) form.append('sortOrder', String(opts.sortOrder));

  debugAdminImageUpload('[admin image upload] E upload start', {
    endpoint: `/api/admin/images/upload?scope=${scope}`,
    scope,
    imageId,
    storageKey,
    payload: {
      fileName: uploadFile.name,
      fileType: uploadFile.type,
      fileSize: uploadFile.size,
      hasEntityType: !!opts?.entityType,
      hasEntityId: !!opts?.entityId,
      hasKind: !!opts?.kind,
      hasSortOrder: opts?.sortOrder !== undefined,
      isPrimary: !!opts?.isPrimary,
    },
  });
  const uploadResponse = await adminFetch(`/api/admin/images/upload?scope=${encodeURIComponent(scope)}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: form,
  });

  let data: any = null;
  try {
    data = await uploadResponse.json();
  } catch {
    throw new Error('Upload response was not valid JSON');
  }

  if (uploadResponse.status === 401) {
    notifyAdminAuthRequired();
    throw new Error('Admin session expired. Please re-authenticate.');
  }

  if (!uploadResponse.ok || data?.ok === false) {
    const detail = data?.detail || data?.code || 'unknown';
    warnAdminImageUpload('[admin image upload] F upload failed', {
      scope,
      status: uploadResponse.status,
      detail,
      body: data,
    });
    throw new Error(`Image upload failed (${uploadResponse.status}): ${detail}`);
  }

  const uploadedImageId = data?.image?.id ?? data?.id ?? imageId;
  const publicUrl = data?.image?.publicUrl ?? data?.url ?? null;
  const uploadedStorageKey = data?.image?.storageKey ?? storageKey;
  const warning = data?.warning ?? undefined;

  if (!publicUrl) {
    throw new Error('Image upload response missing publicUrl');
  }
  debugAdminImageUpload('[admin image upload] F upload success', {
    scope,
    mode: 'server',
    imageId: uploadedImageId,
    publicUrl,
    storageKey: uploadedStorageKey,
    warning: warning || null,
  });
  return {
    id: uploadedImageId,
    url: normalizeImageUrl(publicUrl),
    imageId: uploadedImageId,
    storageKey: uploadedStorageKey,
    warning,
  };
}

export async function adminUploadImageScoped(
  file: File,
  opts?: {
    scope?: UploadScope;
    onStatus?: (status: 'optimizing' | 'uploading') => void;
    entityType?: string;
    entityId?: string;
    kind?: string;
    isPrimary?: boolean;
    sortOrder?: number;
  }
): Promise<{
  id: string;
  url: string;
  imageId?: string | null;
  storageKey?: string;
  warning?: string;
}> {
  if (isDemoAdmin()) {
    opts?.onStatus?.('optimizing');
    opts?.onStatus?.('uploading');
    return adminClient.uploadImage(file);
  }
  return adminUploadImageUnified(file, opts);
}

export async function adminUploadImagesSequential(
  files: File[],
  opts?: {
    scope?: UploadScope;
    onProgress?: (info: {
      index: number;
      total: number;
      file: File;
      status: 'start' | 'success' | 'error';
      result?: { id: string; url: string; imageId?: string | null; storageKey?: string };
      error?: string;
    }) => void;
  }
): Promise<Array<{ file: File; result?: { id: string; url: string; imageId?: string | null; storageKey?: string }; error?: string }>> {
  const total = files.length;
  const scope = opts?.scope || 'products';
  const results: Array<{ file: File; result?: { id: string; url: string; imageId?: string | null; storageKey?: string }; error?: string }> = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    opts?.onProgress?.({ index: i, total, file, status: 'start' });
    try {
      const result = await adminUploadImageScoped(file, { scope });
      results.push({ file, result });
      opts?.onProgress?.({ index: i, total, file, status: 'success', result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      results.push({ file, error: message });
      opts?.onProgress?.({ index: i, total, file, status: 'error', error: message });
    }
  }

  return results;
}

export async function getPublicSiteContentHome(): Promise<HomeSiteContent> {
  const response = await fetch('/api/site-content', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Site content API responded with ${response.status}`);
  const data = await response.json();
  return (data || {}) as HomeSiteContent;
}

export async function getAdminSiteContentHome(): Promise<HomeSiteContent> {
  if (isDemoAdmin()) return adminClient.getHomeContent();
  const response = await adminFetch('/api/admin/site-content', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Admin site content API responded with ${response.status}`);
  const data = await response.json();
  return (data?.json || {}) as HomeSiteContent;
}

export async function updateAdminSiteContentHome(payload: HomeSiteContent): Promise<HomeSiteContent> {
  if (isDemoAdmin()) return adminClient.setHomeContent(payload);
  const response = await adminFetch('/api/admin/site-content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ key: 'home', json: payload }),
  });
  if (!response.ok) throw new Error(`Update site content failed: ${response.status}`);
  const data = await response.json();
  return (data?.json || {}) as HomeSiteContent;
}

export async function adminDeleteMessage(id: string): Promise<void> {
  if (isDemoAdmin()) return adminClient.deleteMessage(id);
  const response = await adminFetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(trimmed || `Delete message failed (${response.status})`);
  }
}

export async function adminDeleteImage(id: string): Promise<void> {
  if (isDemoAdmin()) return adminClient.deleteImage(id);
  const response = await adminFetch(`/api/admin/images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(trimmed || `Delete image failed (${response.status})`);
  }
}







