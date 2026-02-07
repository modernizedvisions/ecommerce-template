import type { Product } from '../types';
import { mockProducts } from './mockData';

const LOCAL_PRODUCTS_KEY = 'admin-products-cache';

export type ProductDraft = {
  name: string;
  description: string;
  priceCents: number;
  category: Product['type'];
  imageUrl: string;
  imageUrls?: string[];
  quantityAvailable?: number;
  isOneOff?: boolean;
  isActive?: boolean;
  stripePriceId?: string;
  stripeProductId?: string;
  collection?: string;
};

const safeStorage = (): Storage | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
};

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const normalizeImages = (draft: ProductDraft) => {
  const merged = [draft.imageUrl, ...(draft.imageUrls || [])]
    .map((url) => url?.trim())
    .filter(Boolean);
  const deduped = Array.from(new Set(merged));
  const imageUrl = deduped[0] || '';
  return { imageUrl, imageUrls: deduped };
};

const mapDraftToProduct = (draft: ProductDraft): Product => {
  const { imageUrl, imageUrls } = normalizeImages(draft);
  const id = crypto.randomUUID();
  const slug = toSlug(draft.name);
  const stripeProductId = draft.stripeProductId || id;

  return {
    id,
    stripeProductId,
    slug,
    name: draft.name.trim(),
    description: draft.description.trim(),
    imageUrls,
    imageUrl,
    thumbnailUrl: imageUrl || undefined,
    type: draft.category,
    collection: draft.collection || undefined,
    oneoff: draft.isOneOff ?? true,
    quantityAvailable: draft.quantityAvailable ?? (draft.isOneOff ? 1 : undefined),
    visible: draft.isActive ?? true,
    isSold: false,
    stripePriceId: draft.stripePriceId || undefined,
    priceCents: draft.priceCents,
  };
};

export const getLocalProducts = (): Product[] => {
  const storage = safeStorage();
  if (!storage) return [...mockProducts];

  try {
    const raw = storage.getItem(LOCAL_PRODUCTS_KEY);
    if (!raw) {
      storage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(mockProducts));
      return [...mockProducts];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Product[];
  } catch {
    // fall back to mocks below
  }

  storage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(mockProducts));
  return [...mockProducts];
};

export const saveLocalProducts = (products: Product[]) => {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
};

export const addLocalProduct = (draft: ProductDraft): Product => {
  const products = getLocalProducts();
  const product = mapDraftToProduct(draft);
  saveLocalProducts([product, ...products]);
  return product;
};

export const updateLocalProduct = (id: string, updates: Partial<ProductDraft>): Product | null => {
  const products = getLocalProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const current = products[index];
  const mergedDraft: ProductDraft = {
    name: updates.name ?? current.name,
    description: updates.description ?? current.description,
    priceCents: updates.priceCents ?? current.priceCents ?? 0,
    category: (updates.category as Product['type']) ?? current.type,
    imageUrl: updates.imageUrl ?? current.imageUrl,
    imageUrls: updates.imageUrls ?? current.imageUrls,
    quantityAvailable: updates.quantityAvailable ?? current.quantityAvailable,
    isOneOff: updates.isOneOff ?? current.oneoff,
    isActive: updates.isActive ?? current.visible,
    stripePriceId: updates.stripePriceId ?? current.stripePriceId,
    stripeProductId: updates.stripeProductId ?? current.stripeProductId,
    collection: updates.collection ?? current.collection,
  };

  const { imageUrl, imageUrls } = normalizeImages(mergedDraft);

  const updated: Product = {
    ...current,
    name: mergedDraft.name.trim(),
    description: mergedDraft.description.trim(),
    priceCents: mergedDraft.priceCents,
    type: mergedDraft.category,
    collection: mergedDraft.collection || undefined,
    oneoff: mergedDraft.isOneOff ?? true,
    visible: mergedDraft.isActive ?? true,
    quantityAvailable: mergedDraft.quantityAvailable,
    stripePriceId: mergedDraft.stripePriceId || undefined,
    stripeProductId: mergedDraft.stripeProductId || current.stripeProductId,
    imageUrl,
    imageUrls,
    thumbnailUrl: imageUrl || current.thumbnailUrl,
    slug: updates.name ? toSlug(mergedDraft.name) : current.slug,
  };

  const next = [...products];
  next[index] = updated;
  saveLocalProducts(next);
  return updated;
};

export const deleteLocalProduct = (id: string): void => {
  const products = getLocalProducts();
  const next = products.filter((p) => p.id !== id);
  saveLocalProducts(next);
};
