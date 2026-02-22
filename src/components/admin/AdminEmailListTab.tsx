import { useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { AdminSectionHeader } from './AdminSectionHeader';
import { formatDateTime } from '../../lib/date';
import { fetchAdminEmailList } from '../../lib/emailListApi';
import type { EmailListItem } from '../../lib/emailListTypes';

export function AdminEmailListTab() {
  const [items, setItems] = useState<EmailListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchAdminEmailList();
      setItems(response.items);
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load email list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      }),
    [items]
  );

  const handleCopy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email copied');
    } catch {
      toast.error('Unable to copy email');
    }
  };

  const handleCopyAll = async () => {
    const all = sortedItems.map((entry) => entry.email).join('\n');
    if (!all) return;
    try {
      await navigator.clipboard.writeText(all);
      toast.success('All emails copied');
    } catch {
      toast.error('Unable to copy all emails');
    }
  };

  return (
    <div className="lux-card p-6 space-y-4">
      <div className="relative">
        <AdminSectionHeader
          title="Email List"
          subtitle="Emails collected from the public /join page."
          className="mb-0"
        />
        <div className="hidden sm:flex sm:absolute sm:right-0 sm:top-0 sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
          <button
            type="button"
            className="lux-button--ghost px-3 py-2 text-[10px] disabled:opacity-60"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh
              </span>
            )}
          </button>
          <button
            type="button"
            className="lux-button px-3 py-2 text-[10px] disabled:opacity-60"
            onClick={() => void handleCopyAll()}
            disabled={sortedItems.length === 0}
          >
            Copy All
          </button>
        </div>
      </div>
      <div className="flex w-full gap-3 sm:hidden">
        <button
          type="button"
          className="lux-button--ghost flex-1 px-3 py-2 text-[10px] disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </span>
          )}
        </button>
        <button
          type="button"
          className="lux-button flex-1 px-3 py-2 text-[10px] disabled:opacity-60"
          onClick={() => void handleCopyAll()}
          disabled={sortedItems.length === 0}
        >
          Copy All
        </button>
      </div>

      {error && (
        <div className="rounded-shell border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {sortedItems.length === 0 && !loading ? (
        <div className="text-sm text-charcoal/60">No emails yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-driftwood/50 text-sm">
            <thead className="bg-linen/70 text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">
              <tr>
                <th className="px-4 py-2 text-left">Received</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-driftwood/50 bg-white/80 text-charcoal">
              {sortedItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-charcoal/70">{formatDateTime(item.created_at) || item.created_at}</td>
                  <td className="px-4 py-2 font-medium">{item.email}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="lux-button--ghost px-3 py-1 text-[10px]"
                      onClick={() => void handleCopy(item.email)}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
