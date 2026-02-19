import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setStoredAdminPassword } from '../lib/emailListApi';

type LoginResponse = {
  ok?: boolean;
  code?: string;
  expiresAt?: string;
};

export function AdminLoginPage() {
  const navigate = useNavigate();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void fetch('/api/admin/auth/me', { credentials: 'include' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as LoginResponse | null;
        console.debug('[admin login] /me check', { status: response.status, payload });
      })
      .catch((fetchError) => {
        console.debug('[admin login] /me check failed', fetchError);
      });
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (response.ok && payload?.ok) {
        setStoredAdminPassword(password);
        setPassword('');
        navigate('/admin/customers', { replace: true });
        return;
      }

      if (response.status === 401 && payload?.code === 'BAD_PASSWORD') {
        setError('Incorrect password. Please try again.');
        passwordInputRef.current?.focus();
        return;
      }

      if (response.status === 500) {
        setError('Unable to sign in right now. Please try again.');
        return;
      }

      setError('Unable to sign in. Please verify your input and try again.');
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="lux-card w-full max-w-md p-8 text-charcoal">
        <h2 className="lux-heading text-2xl mb-6 text-center">Admin Login</h2>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label htmlFor="admin-password" className="lux-label mb-2 block">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              ref={passwordInputRef}
              className="lux-input font-semibold tracking-[0.12em]"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <div className="mb-4 rounded-shell border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <button type="submit" disabled={isLoading} className="lux-button w-full justify-center disabled:opacity-50">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
