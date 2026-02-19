import type { AdminEmailListResponse, EmailListSubscribeResult } from './emailListTypes';

export const ADMIN_PASSWORD_STORAGE_KEY = 'admin_password';

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!data) throw new Error('Response was not valid JSON');
  return data;
};

export const getStoredAdminPassword = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const setStoredAdminPassword = (password: string): void => {
  if (typeof window === 'undefined') return;
  try {
    if (!password) {
      window.localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
  } catch {}
};

export const clearStoredAdminPassword = (): void => setStoredAdminPassword('');

export async function subscribeToEmailList(email: string): Promise<EmailListSubscribeResult> {
  const response = await fetch('/api/email-list/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await parseJson<any>(response).catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : '';
    throw new Error(detail || `Failed to subscribe (${response.status})`);
  }
  return {
    ok: !!data?.ok,
    alreadySubscribed: !!data?.alreadySubscribed,
  };
}

export async function fetchAdminEmailList(passwordOverride?: string): Promise<AdminEmailListResponse> {
  const password = (passwordOverride ?? getStoredAdminPassword()).trim();
  if (!password) {
    throw new Error('Admin password is required.');
  }
  const response = await fetch('/api/admin/email-list', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-admin-password': password,
    },
  });
  const data = await parseJson<any>(response).catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : data?.code || '';
    throw new Error(detail || `Failed to fetch email list (${response.status})`);
  }
  return {
    ok: !!data?.ok,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

