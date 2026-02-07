import type { Category } from './types';

export type ShippingItem = {
  category?: string | null;
  categories?: Array<string | null> | null;
};

const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const buildCategoryShippingMap = (categories: Category[]) => {
  const map = new Map<string, number>();
  categories.forEach((cat) => {
    const rawCents = cat.shippingCents;
    const shippingCents =
      Number.isFinite(rawCents as number) && (rawCents as number) >= 0
        ? Number(rawCents)
        : 0;
    const slugKey = cat.slug ? normalizeCategoryKey(cat.slug) : '';
    const nameKey = cat.name ? normalizeCategoryKey(cat.name) : '';
    [slugKey, nameKey].filter(Boolean).forEach((key) => {
      const existing = map.get(key);
      if (existing === undefined || shippingCents < existing) {
        map.set(key, shippingCents);
      }
    });
  });
  return map;
};

const resolveItemShippingCents = (item: ShippingItem, map: Map<string, number>): number | null => {
  const categories = [
    item.category,
    ...(Array.isArray(item.categories) ? item.categories : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (!categories.length) return null;

  let itemMin: number | null = null;
  for (const raw of categories) {
    const key = normalizeCategoryKey(raw);
    if (!key || !map.has(key)) continue;
    const shipping = map.get(key) ?? 0;
    if (shipping === 0) return 0;
    if (itemMin === null || shipping < itemMin) itemMin = shipping;
  }
  return itemMin;
};

// Centralized shipping rule for frontend display (must match server helper).
export function calculateShippingCents(items: ShippingItem[], categories: Category[]): number {
  if (!items.length || !categories.length) return 0;
  const map = buildCategoryShippingMap(categories);
  let orderMin: number | null = null;
  for (const item of items) {
    const itemShipping = resolveItemShippingCents(item, map);
    if (itemShipping === 0) return 0;
    if (itemShipping !== null && (orderMin === null || itemShipping < orderMin)) {
      orderMin = itemShipping;
    }
  }
  return orderMin ?? 0;
}
