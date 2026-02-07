import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Promotion } from './types';

type PromotionContextValue = {
  promotion: Promotion | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const PromotionContext = createContext<PromotionContextValue | undefined>(undefined);

const fetchActivePromotion = async (): Promise<Promotion | null> => {
  const response = await fetch('/api/promotions/active', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Active promotion fetch failed (${response.status})`);
  }
  const data = await response.json();
  return (data?.promotion as Promotion | null) || null;
};

export const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const getCategoryKeys = (
  input:
    | { category?: string | null; categories?: string[] | null }
    | string[]
    | string
    | null
    | undefined
): string[] => {
  if (!input) return [];
  if (typeof input === 'string') {
    const normalized = normalizeCategoryKey(input);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(input)) {
    return input
      .filter((value) => typeof value === 'string')
      .map((value) => normalizeCategoryKey(value))
      .filter(Boolean);
  }
  const keys: string[] = [];
  if (input.category) {
    const normalized = normalizeCategoryKey(input.category);
    if (normalized) keys.push(normalized);
  }
  if (Array.isArray(input.categories)) {
    input.categories.forEach((value) => {
      if (typeof value !== 'string') return;
      const normalized = normalizeCategoryKey(value);
      if (normalized) keys.push(normalized);
    });
  }
  return keys;
};

export const isPromotionEligible = (
  promotion: Promotion | null | undefined,
  input:
    | { category?: string | null; categories?: string[] | null }
    | string[]
    | string
    | null
    | undefined
): boolean => {
  if (!promotion || !promotion.enabled) return false;
  if (!promotion.percentOff || promotion.percentOff <= 0) return false;
  if (promotion.scope === 'global') return true;
  const categoryKeys = getCategoryKeys(input);
  if (!categoryKeys.length) return false;
  return categoryKeys.some((key) => promotion.categorySlugs.includes(key));
};

export const getDiscountedCents = (priceCents: number, percentOff: number): number => {
  if (!Number.isFinite(priceCents) || !Number.isFinite(percentOff) || percentOff <= 0) {
    return priceCents;
  }
  return Math.max(0, Math.round((priceCents * (100 - percentOff)) / 100));
};

export function PromotionProvider({ children }: { children: ReactNode }) {
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const active = await fetchActivePromotion();
      setPromotion(active);
    } catch (error) {
      console.error('Failed to load active promotion', error);
      setPromotion(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!mounted) return;
      await refresh();
    };
    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      promotion,
      isLoading,
      refresh,
    }),
    [promotion, isLoading, refresh]
  );

  return <PromotionContext.Provider value={value}>{children}</PromotionContext.Provider>;
}

export const usePromotions = () => {
  const context = useContext(PromotionContext);
  if (!context) {
    throw new Error('usePromotions must be used within PromotionProvider');
  }
  return context;
};
