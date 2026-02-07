import type { Category } from './types';

export const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export type CategoryOptionGroup = {
  label: string;
  options: string[];
};

const normalizeOptionList = (items: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  items.forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });
  return normalized;
};

export const buildCategoryOptionLookup = (categories: Category[]) => {
  const map = new Map<string, CategoryOptionGroup>();
  categories.forEach((cat) => {
    const label = (cat.optionGroupLabel || '').trim();
    const options = normalizeOptionList(cat.optionGroupOptions || []);
    if (!label || options.length === 0) return;
    const slugKey = cat.slug ? normalizeCategoryKey(cat.slug) : '';
    const nameKey = cat.name ? normalizeCategoryKey(cat.name) : '';
    [slugKey, nameKey].filter(Boolean).forEach((key) => {
      if (!map.has(key)) map.set(key, { label, options });
    });
  });
  return map;
};

export const resolveCategoryOptionGroup = (
  categoryValue: string | null | undefined,
  lookup: Map<string, CategoryOptionGroup>
) => {
  const key = categoryValue ? normalizeCategoryKey(categoryValue) : '';
  return key ? lookup.get(key) || null : null;
};
