import { adminFetch } from './adminAuth';
import type { PromoCode } from './types';

export type PromoCodeInput = {
  code: string;
  enabled?: boolean;
  percentOff?: number | null;
  freeShipping?: boolean;
  scope: 'global' | 'categories';
  categorySlugs?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
};

const PROMO_CODES_PATH = '/api/admin/promo-codes';

export async function fetchAdminPromoCodes(): Promise<PromoCode[]> {
  const response = await adminFetch(PROMO_CODES_PATH, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to load promo codes (${response.status})`);
  const data = await response.json();
  return Array.isArray(data.promoCodes) ? (data.promoCodes as PromoCode[]) : [];
}

export async function createAdminPromoCode(payload: PromoCodeInput): Promise<PromoCode> {
  const response = await adminFetch(PROMO_CODES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to create promo code (${response.status})`);
  }
  return data.promoCode as PromoCode;
}

export async function updateAdminPromoCode(id: string, updates: Partial<PromoCodeInput>): Promise<PromoCode> {
  const response = await adminFetch(`${PROMO_CODES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to update promo code (${response.status})`);
  }
  return data.promoCode as PromoCode;
}

export async function deleteAdminPromoCode(id: string): Promise<void> {
  const response = await adminFetch(`${PROMO_CODES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to delete promo code (${response.status})`);
  }
}
