const shouldDebug = () => import.meta.env.VITE_DEBUG_ADMIN_AUTH === '1';

export const notifyAdminAuthRequired = (message?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('admin-auth-required', {
      detail: { message: message || 'Admin session expired. Please re-authenticate.' },
    })
  );
};

export const adminFetch = async (input: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});

  if (shouldDebug()) {
    console.debug('[admin auth] fetch', { path: input });
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    notifyAdminAuthRequired();
    throw new Error('Admin session expired. Please re-authenticate.');
  }

  return response;
};
