import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useForm } from 'react-hook-form';
import { AdminSectionHeader } from './AdminSectionHeader';
import { AdminSaveButton } from './AdminSaveButton';
import { adminUploadImageScoped } from '../../lib/api';
import { formatEasternDateTime } from '../../lib/dates';

interface AdminCustomOrdersTabProps {
  allCustomOrders: any[];
  onCreateOrder: (data: any) => Promise<void> | void;
  onUpdateOrder?: (id: string, data: any) => Promise<void> | void;
  onReloadOrders?: () => Promise<void> | void;
  onSendPaymentLink?: (id: string) => Promise<void> | void;
  onArchiveOrder?: (id: string) => Promise<void> | void;
  initialDraft?: any;
  onDraftConsumed?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

type CustomOrderImageState = {
  url: string | null;
  imageId?: string | null;
  storageKey?: string | null;
  previewUrl?: string | null;
  uploading: boolean;
  optimizing?: boolean;
  uploadError?: string | null;
};

export const AdminCustomOrdersTab: React.FC<AdminCustomOrdersTabProps> = ({
  allCustomOrders,
  onCreateOrder,
  onUpdateOrder,
  onReloadOrders,
  onSendPaymentLink,
  onArchiveOrder,
  initialDraft,
  onDraftConsumed,
  isLoading,
  error,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const createImageInputRef = useRef<HTMLInputElement | null>(null);
  const viewImageInputRef = useRef<HTMLInputElement | null>(null);
  const buildImageState = (
    url?: string | null,
    imageId?: string | null,
    storageKey?: string | null
  ): CustomOrderImageState => ({
    url: url || null,
    imageId: imageId || null,
    storageKey: storageKey || null,
    previewUrl: url || null,
    uploading: false,
    uploadError: null,
  });
  const [draftImage, setDraftImage] = useState<CustomOrderImageState>(() => buildImageState(null));
  const [viewImage, setViewImage] = useState<CustomOrderImageState>(() => buildImageState(null));
  const [viewShipping, setViewShipping] = useState('');
  const [viewShowOnSoldProducts, setViewShowOnSoldProducts] = useState(false);
  const [viewSaveState, setViewSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sendingPaymentLinks, setSendingPaymentLinks] = useState<Set<string>>(new Set());
  const draftDefaults = useMemo(() => {
    if (!initialDraft) return undefined;
    const draftShipping =
      typeof initialDraft.shippingCents === 'number'
        ? (initialDraft.shippingCents / 100).toFixed(2)
        : '';
    return {
      customerName: initialDraft.customerName || '',
      customerEmail: initialDraft.customerEmail || '',
      description: initialDraft.description || '',
      amount: initialDraft.amount ?? '',
      shipping: draftShipping,
      showOnSoldProducts: false,
    };
  }, [initialDraft]);

  const { register, handleSubmit, reset, formState, setValue } = useForm({
    defaultValues: {
      customerName: '',
      customerEmail: '',
      description: '',
      amount: '',
      shipping: '',
      showOnSoldProducts: false,
    },
  });

  useEffect(() => {
    if (initialDraft) {
      const draftShipping =
        typeof initialDraft.shippingCents === 'number'
          ? (initialDraft.shippingCents / 100).toFixed(2)
          : '';
      const mappedDraft = {
        customerName: initialDraft.customerName || '',
        customerEmail: initialDraft.customerEmail || '',
        description: initialDraft.description || '',
        amount: initialDraft.amount ?? '',
        shipping: draftShipping,
        showOnSoldProducts: false,
      };
      reset(mappedDraft);
      setIsModalOpen(true);
      onDraftConsumed?.();
    }
  }, [initialDraft, onDraftConsumed, reset]);

  useEffect(() => {
    if (!isModalOpen) {
      reset({
        customerName: '',
        customerEmail: '',
        description: '',
        amount: '',
        shipping: '',
        showOnSoldProducts: false,
      });
      setDraftImage(buildImageState(null));
    }
  }, [isModalOpen, reset]);

  useEffect(() => {
    if (!archiveNotice) return;
    const timeout = window.setTimeout(() => setArchiveNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [archiveNotice]);

  const startImageUpload = async (
    file: File,
    setState: React.Dispatch<React.SetStateAction<CustomOrderImageState>>
  ) => {
    const previewUrl = URL.createObjectURL(file);
    let previousUrl: string | null = null;
    let previousImageId: string | null = null;
    let previousStorageKey: string | null = null;
    setState((prev) => {
      previousUrl = prev.url ?? null;
      previousImageId = prev.imageId ?? null;
      previousStorageKey = prev.storageKey ?? null;
      return {
        ...prev,
        previewUrl,
        uploading: true,
        optimizing: true,
        uploadError: null,
      };
    });

    try {
      const result = await adminUploadImageScoped(file, {
        scope: 'custom-orders',
        onStatus: (status) => {
          setState((prev) => ({
            ...prev,
            uploading: true,
            optimizing: status === 'optimizing',
          }));
        },
      });
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      const resolvedImageId = result.imageId || result.id || null;
      const resolvedStorageKey = result.storageKey || null;
      setState({
        url: result.url,
        imageId: resolvedImageId,
        storageKey: resolvedStorageKey,
        previewUrl: result.url,
        uploading: false,
        optimizing: false,
        uploadError: null,
      });
    } catch (err) {
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      const message = err instanceof Error ? err.message : 'Upload failed';
      setState({
        url: previousUrl,
        imageId: previousImageId,
        storageKey: previousStorageKey,
        previewUrl: previousUrl,
        uploading: false,
        optimizing: false,
        uploadError: message,
      });
    }
  };

  const removeImage = (
    setState: React.Dispatch<React.SetStateAction<CustomOrderImageState>>
  ) => {
    setState((prev) => {
      if (prev.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return buildImageState(null);
    });
  };
  const handleDraftImageRemove = () => {
    removeImage(setDraftImage);
    setValue('showOnSoldProducts', false);
  };
  const handleViewImageRemove = () => {
    removeImage(setViewImage);
    setViewShowOnSoldProducts(false);
  };

  if (import.meta.env.DEV) {
    console.debug('[custom orders tab] render', { count: allCustomOrders.length });
  }

  const openView = (order: any) => {
    setSelectedOrder(order);
    setViewImage(
      buildImageState(
        order.imageUrl || order.image_url || null,
        order.imageId || order.image_id || null,
        order.imageStorageKey || order.image_storage_key || null
      )
    );
    const shipping = resolveShippingCents(order);
    setViewShipping(shipping ? (shipping / 100).toFixed(2) : '');
    const showOnSold = order.showOnSoldProducts === true || order.show_on_sold_products === 1;
    setViewShowOnSoldProducts(showOnSold);
    setViewSaveState('idle');
    setIsViewOpen(true);
  };

  const closeView = () => {
    setIsViewOpen(false);
    setSelectedOrder(null);
    setIsArchiveConfirmOpen(false);
    setIsArchiving(false);
    setViewImage(buildImageState(null));
    setViewSaveState('idle');
    setViewShipping('');
    setViewShowOnSoldProducts(false);
  };

  const handleArchive = async () => {
    if (!selectedOrder || !onArchiveOrder) return;
    setIsArchiving(true);
    setArchiveNotice(null);
    try {
      await onArchiveOrder(selectedOrder.id);
      setArchiveNotice({
        type: 'success',
        message: `Archived ${normalizeDisplayId(selectedOrder)}.`,
      });
      setIsArchiveConfirmOpen(false);
      closeView();
    } catch (err) {
      setArchiveNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to archive custom order',
      });
    } finally {
      setIsArchiving(false);
    }
  };
  const handleSendPaymentLink = async (orderId: string) => {
    if (!onSendPaymentLink) return;
    setSendingPaymentLinks((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
    try {
      await onSendPaymentLink(orderId);
    } finally {
      setSendingPaymentLinks((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };
  const formatCurrency = (cents: number | null | undefined) => `${((cents ?? 0) / 100).toFixed(2)}`;
  const formatShipping = (cents: number | null | undefined) =>
    (cents ?? 0) <= 0 ? 'FREE' : formatCurrency(cents);
  const safeDate = (value?: string | null) =>
    value ? formatEasternDateTime(value) || 'Unknown date' : 'Unknown date';
  const normalizeDisplayId = (order: any) =>
    order.displayCustomOrderId || order.display_custom_order_id || order.id || 'Order';
  const normalizeShippingCents = (raw: string): number => {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100);
  };
  const resolveShippingCents = (order: any) => {
    if (!order) return 0;
    if (typeof order.shippingCents === 'number') return order.shippingCents;
    if (typeof order.shipping_cents === 'number') return order.shipping_cents;
    return 0;
  };

  return (
    <div className="lux-card p-6 space-y-4">
      <div className="space-y-3">
        <AdminSectionHeader
          title="Custom Orders"
          subtitle="Manage bespoke customer requests and payment links."
        />
        <div className="flex justify-center sm:justify-end">
          <button
            type="button"
            onClick={() => {
              reset(draftDefaults || { customerName: '', customerEmail: '', description: '', amount: '' });
              setIsModalOpen(true);
            }}
            className="lux-button px-4 py-2 text-[10px]"
          >
            New Custom Order
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => onReloadOrders?.()}
              className="ml-2 lux-button--ghost px-3 py-2 text-[10px]"
            >
              Debug: Reload
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-shell border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {archiveNotice && (
        <div
          className={`rounded-shell border px-4 py-3 text-sm ${
            archiveNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {archiveNotice.message}
        </div>
      )}

      <div>
        {isLoading ? (
          <div className="p-4 text-sm text-charcoal/70">Loading custom orders...</div>
        ) : allCustomOrders.length === 0 ? (
          <div className="p-4 text-sm text-charcoal/70">No custom orders yet.</div>
        ) : (
          <>
            <div className="sm:hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_2.5rem] gap-3 border-b border-driftwood/60 bg-linen/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">
                <div>Customer</div>
                <div className="text-center">Actions</div>
                <div className="text-right">Status</div>
              </div>
              <div className="divide-y divide-driftwood/50 bg-white/80">
                {allCustomOrders.map((order) => {
                  const statusLabel = order.status || 'pending';
                  const hasPaymentLink = !!order.paymentLink;
                  const isPaid = statusLabel === 'paid';
                  const isSending = sendingPaymentLinks.has(order.id);
                  return (
                    <div
                      key={order.id}
                      className="grid grid-cols-[minmax(0,1fr)_8.5rem_2.5rem] gap-3 px-4 py-3 text-sm text-charcoal"
                    >
                      <div className="whitespace-normal break-words font-medium">
                        {order.customerName || 'Customer'}
                      </div>
                      <div className="flex flex-col items-center gap-2 justify-self-center w-[8.5rem]">
                        <button
                          type="button"
                          className="w-full lux-button--ghost px-3 py-1 text-[10px] h-9 leading-tight"
                          onClick={() => openView(order)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="w-full lux-button--ghost px-3 py-1 text-[10px] h-9 leading-tight disabled:opacity-60 disabled:cursor-not-allowed"
                          disabled={isPaid || isSending}
                          title={isPaid ? 'Already paid' : hasPaymentLink ? 'Resend payment link' : ''}
                          onClick={() => handleSendPaymentLink(order.id)}
                        >
                          {isSending ? (
                            <span className="inline-flex items-center justify-center gap-2 leading-tight">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Sending
                            </span>
                          ) : (
                            <>
                              <span className="block leading-tight">{hasPaymentLink ? 'Resend' : 'Send'}</span>
                              <span className="block leading-tight">Payment</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="flex items-start justify-end pt-1">
                        <span
                          role="img"
                          aria-label={isPaid ? 'Paid' : 'Not paid'}
                          className={`text-lg font-semibold ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}
                        >
                          {isPaid ? '\u2713' : '\u2715'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="overflow-x-auto">

            <table className="min-w-full divide-y divide-driftwood/50 text-sm">
  <thead className="bg-linen/70 text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">
    <tr>
      <th className="px-4 py-2 text-center">Order ID</th>
      <th className="px-4 py-2 text-center">Customer</th>
      <th className="px-4 py-2 text-center">Email</th>
      <th className="px-4 py-2 text-center">Amount</th>
      <th className="px-4 py-2 text-center">Status</th>
      <th className="px-4 py-2 text-center">View</th>
      <th className="px-4 py-2 text-center">Actions</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-driftwood/50 bg-white/80 text-charcoal">
    {allCustomOrders.map((order) => {
      const amount = typeof order.amount === 'number' ? order.amount : null;
      const shippingCents = resolveShippingCents(order);
      const totalCents = amount !== null ? amount + shippingCents : null;
      const amountLabel = totalCents !== null ? `$${(totalCents / 100).toFixed(2)}` : '--';
      const statusLabel = order.status || 'pending';
      const displayId = normalizeDisplayId(order);
      const hasPaymentLink = !!order.paymentLink;
      const isSending = sendingPaymentLinks.has(order.id);
      return (
        <tr key={order.id}>
          <td className="px-4 py-2 text-center align-middle font-mono text-xs text-charcoal/70">{displayId}</td>
          <td className="px-4 py-2 text-center align-middle">{order.customerName || 'Customer'}</td>
          <td className="px-4 py-2 text-center align-middle">{order.customerEmail || '--'}</td>
          <td className="px-4 py-2 text-center align-middle">{amountLabel}</td>
          <td className="px-4 py-2 text-center align-middle capitalize">{statusLabel}</td>
          <td className="px-4 py-2 text-center align-middle">
            <div className="flex justify-center">
              <button
                type="button"
                className="lux-button--ghost px-3 py-1 text-[10px]"
                onClick={() => openView(order)}
              >
                View
              </button>
            </div>
          </td>
          <td className="px-4 py-2 text-center align-middle">
            <div className="flex justify-center">
              <button
                type="button"
                className="lux-button--ghost px-3 py-1 text-[10px] disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={statusLabel === 'paid' || isSending}
                title={statusLabel === 'paid' ? 'Already paid' : hasPaymentLink ? 'Resend payment link' : ''}
                onClick={() => handleSendPaymentLink(order.id)}
              >
                {isSending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending...
                  </span>
                ) : hasPaymentLink ? (
                  'Resend Payment Link'
                ) : (
                  'Send Payment Link'
                )}
              </button>
            </div>
          </td>
        </tr>
      );
    })}
  </tbody>
</table>
          
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={isViewOpen && !!selectedOrder}
        onOpenChange={(next) => {
          if (!next) closeView();
        }}
        overlayClassName="items-center px-3 py-6 sm:py-6"
        contentClassName="max-w-xl max-h-[85vh] overflow-y-auto overflow-x-hidden"
      >
        {selectedOrder && (
          <DialogContent className="relative space-y-5">
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsArchiveConfirmOpen(true)}
                disabled={!selectedOrder || !onArchiveOrder || isArchiving}
                className="lux-button--ghost px-2 py-1 text-[10px] !text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Archive custom order"
                title="Archive"
              >
                <Archive className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={closeView}
                className="lux-button--ghost px-3 py-1 text-[10px]"
              >
                CLOSE
              </button>
            </div>

            <div>
              <p className="lux-label text-[10px] mb-1">Custom Order</p>
              <div className="lux-heading text-xl">
                Order {normalizeDisplayId(selectedOrder)}
              </div>
              <p className="text-sm text-charcoal/70">
                Placed {safeDate(selectedOrder.createdAt || selectedOrder.created_at)}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-1.5">Customer</p>
                <div className="text-sm text-charcoal">{selectedOrder.customerName || '-'}</div>
                <div className="text-sm text-charcoal/70">{selectedOrder.customerEmail || '-'}</div>
              </section>

              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-1.5">Shipping</p>
                {selectedOrder.shippingAddress ? (
                  <div className="text-sm text-charcoal/80 whitespace-pre-line">
                    {[
                      selectedOrder.shippingAddress.name,
                      selectedOrder.shippingAddress.line1,
                      selectedOrder.shippingAddress.line2,
                      [selectedOrder.shippingAddress.city, selectedOrder.shippingAddress.state, selectedOrder.shippingAddress.postal_code]
                        .filter(Boolean)
                        .join(', '),
                      selectedOrder.shippingAddress.country,
                      selectedOrder.shippingAddress.phone ? `Phone: ${selectedOrder.shippingAddress.phone}` : null,
                    ]
                      .filter((line) => line && String(line).trim().length > 0)
                      .join('\n') || 'No shipping address collected.'}
                  </div>
                ) : (
                  <div className="text-sm text-charcoal/70">No shipping address collected.</div>
                )}
              </section>

              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-1.5">Status</p>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span
                    className={`inline-flex items-center rounded-ui px-3 py-1 border ${
                      (selectedOrder.status || 'pending') === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : 'bg-amber-50 text-amber-700 border-amber-100'
                    }`}
                  >
                    {(selectedOrder.status || 'pending').toUpperCase()}
                  </span>
                  <span className="inline-flex items-center rounded-ui bg-linen/80 px-3 py-1 text-charcoal/80 border border-driftwood/60">
                    {safeDate(selectedOrder.createdAt || selectedOrder.created_at)}
                  </span>
                  {viewShowOnSoldProducts && (
                    <span className="inline-flex items-center rounded-ui bg-deep-ocean px-3 py-1 text-white border border-deep-ocean">
                      Visible in Sold Products
                    </span>
                  )}
                </div>
              </section>

              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-2">Totals</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal/70">Subtotal</span>
                    <span className="font-medium text-charcoal">
                      {typeof selectedOrder.amount === 'number' ? formatCurrency(selectedOrder.amount) : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal/70">Shipping</span>
                    <span className="font-medium text-charcoal">
                      {formatShipping(resolveShippingCents(selectedOrder))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal/70">Total</span>
                    <span className="font-medium text-charcoal">
                      {formatCurrency(
                        (typeof selectedOrder.amount === 'number' ? selectedOrder.amount : 0) +
                          resolveShippingCents(selectedOrder)
                      )}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <label className="lux-label text-[10px]">Edit shipping (USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={viewShipping}
                    onChange={(e) => setViewShipping(e.target.value)}
                    className="lux-input text-sm"
                  />
                  <p className="text-[11px] text-charcoal/60">Leave blank for FREE.</p>
                </div>
              </section>

              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-2">Message</p>
                <div className="text-sm text-charcoal whitespace-pre-wrap">
                  {selectedOrder.description || '-'}
                </div>
              </section>

              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-2">Image</p>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-24 w-24 rounded-shell border border-driftwood/60 bg-linen/80 overflow-hidden">
                    {viewImage.previewUrl ? (
                      <img
                        src={viewImage.previewUrl}
                        alt="Custom order"
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/40">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => viewImageInputRef.current?.click()}
                      className="lux-button--ghost px-3 py-1 text-[10px]"
                    >
                      {viewImage.url ? 'Replace Image' : 'Upload Image'}
                    </button>
                    {viewImage.url && (
                      <button
                        type="button"
                        onClick={handleViewImageRemove}
                        className="block text-xs text-charcoal/70 underline hover:text-deep-ocean"
                      >
                        Remove image
                      </button>
                    )}
                    {viewImage.uploading && (
                      <div className="text-xs text-charcoal/60">
                        {viewImage.optimizing ? 'Optimizing image...' : 'Uploading image...'}
                      </div>
                    )}
                    {viewImage.uploadError && (
                      <div className="text-xs text-red-600">{viewImage.uploadError}</div>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <label className="flex items-center gap-2 text-sm text-charcoal/80">
                    <input
                      type="checkbox"
                      checked={viewShowOnSoldProducts}
                      onChange={(e) => setViewShowOnSoldProducts(e.target.checked)}
                      disabled={!viewImage.url}
                      className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className={viewImage.url ? '' : 'opacity-50'}>Display Custom Order On Sold Products</span>
                  </label>
                  {!viewImage.url && (
                    <p className="text-xs text-charcoal/60">Upload an image to enable this option.</p>
                  )}
                </div>
                <input
                  ref={viewImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void startImageUpload(file, setViewImage);
                    }
                    if (viewImageInputRef.current) {
                      viewImageInputRef.current.value = '';
                    }
                  }}
                />
              </section>

              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-2">Payment Link</p>
                {selectedOrder.paymentLink ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href={selectedOrder.paymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="lux-button px-3 py-2 text-[10px]"
                    >
                      Open Stripe Checkout
                    </a>
                    <button
                      type="button"
                      className="text-xs text-charcoal/70 hover:text-deep-ocean underline"
                      onClick={() => {
                        if (navigator?.clipboard?.writeText) {
                          navigator.clipboard.writeText(selectedOrder.paymentLink);
                        }
                      }}
                    >
                      Copy link
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-charcoal/70">Not sent yet.</div>
                )}
              </section>

              <div className="flex justify-end">
                <AdminSaveButton
                  saveState={viewSaveState}
                  onClick={async () => {
                    if (!selectedOrder || !onUpdateOrder) return;
                    const currentUrl = selectedOrder.imageUrl || selectedOrder.image_url || null;
                    const currentShipping = resolveShippingCents(selectedOrder);
                    const currentShowOnSold =
                      selectedOrder.showOnSoldProducts === true || selectedOrder.show_on_sold_products === 1;
                    const desiredShipping = normalizeShippingCents(viewShipping || '');
                    const hasImageChange = viewImage.url !== currentUrl;
                    const hasShippingChange = desiredShipping !== currentShipping;
                    const hasShowOnSoldChange = viewShowOnSoldProducts !== currentShowOnSold;
                    const hasChanges = hasImageChange || hasShippingChange || hasShowOnSoldChange;
                    if (viewImage.uploading || viewImage.uploadError || !hasChanges) return;
                    setViewSaveState('saving');
                    try {
                      const updates: any = {};
                      if (hasImageChange) {
                        updates.imageUrl = viewImage.url;
                        updates.imageId = viewImage.imageId || null;
                        updates.imageStorageKey = viewImage.storageKey || null;
                      }
                      if (hasShippingChange) updates.shippingCents = desiredShipping;
                      if (hasShowOnSoldChange) updates.showOnSoldProducts = viewShowOnSoldProducts;
                      await onUpdateOrder(selectedOrder.id, updates);
                      setSelectedOrder((prev: any) =>
                        prev
                          ? {
                              ...prev,
                              ...(hasImageChange ? { imageUrl: viewImage.url } : {}),
                              ...(hasShippingChange ? { shippingCents: desiredShipping } : {}),
                            }
                          : prev
                      );
                      setViewShipping(desiredShipping ? (desiredShipping / 100).toFixed(2) : '');
                      setViewSaveState('success');
                      setTimeout(() => setViewSaveState('idle'), 1500);
                    } catch (err) {
                      console.error('Failed to update custom order', err);
                      setViewSaveState('error');
                      setTimeout(() => setViewSaveState('idle'), 1500);
                    }
                  }}
                  disabled={
                    !onUpdateOrder ||
                    viewImage.uploading ||
                    !!viewImage.uploadError ||
                    (viewImage.url === (selectedOrder.imageUrl || selectedOrder.image_url || null) &&
                      normalizeShippingCents(viewShipping || '') === resolveShippingCents(selectedOrder) &&
                      viewShowOnSoldProducts ===
                        (selectedOrder.showOnSoldProducts === true ||
                          selectedOrder.show_on_sold_products === 1))
                  }
                  idleLabel="Save Changes"
                />
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={isArchiveConfirmOpen}
        title="Archive custom order?"
        description={`Confirm archiving "${selectedOrder ? normalizeDisplayId(selectedOrder) : 'Order'}". This removes it from the active list but keeps it saved for records.`}
        confirmText={isArchiving ? 'Archiving...' : 'Archive'}
        cancelText="Cancel"
        confirmVariant="danger"
        confirmDisabled={isArchiving}
        cancelDisabled={isArchiving}
        onCancel={() => setIsArchiveConfirmOpen(false)}
        onConfirm={handleArchive}
      />
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Create Custom Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form
              className="space-y-4"
              onSubmit={handleSubmit(async (values) => {
                if (draftImage.uploading || draftImage.uploadError) return;
                const shippingCents = normalizeShippingCents(values.shipping || '');
                const showOnSoldProducts = !!draftImage.url && values.showOnSoldProducts === true;
                await onCreateOrder({
                  ...values,
                  shippingCents,
                  showOnSoldProducts,
                  imageUrl: draftImage.url || null,
                  imageId: draftImage.imageId || null,
                  imageStorageKey: draftImage.storageKey || null,
                });
                setIsModalOpen(false);
              })}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="lux-label mb-2 block">Customer Name</label>
                  <input
                    {...register('customerName', { required: true })}
                    className="lux-input text-sm"
                  />
                </div>
                <div>
                  <label className="lux-label mb-2 block">Customer Email</label>
                  <input
                    type="email"
                    {...register('customerEmail', { required: true })}
                    className="lux-input text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="lux-label mb-2 block">Description</label>
                <textarea
                  rows={4}
                  {...register('description', { required: true })}
                  className="lux-input text-sm"
                />
              </div>

              <div>
                <label className="lux-label mb-2 block">Image (optional)</label>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-24 w-24 rounded-shell border border-driftwood/60 bg-linen/80 overflow-hidden">
                    {draftImage.previewUrl ? (
                      <img
                        src={draftImage.previewUrl}
                        alt="Custom order"
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/40">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => createImageInputRef.current?.click()}
                      className="lux-button--ghost px-3 py-1 text-[10px]"
                    >
                      {draftImage.url ? 'Replace Image' : 'Upload Image'}
                    </button>
                    {draftImage.url && (
                      <button
                        type="button"
                        onClick={handleDraftImageRemove}
                        className="block text-xs text-charcoal/70 underline hover:text-deep-ocean"
                      >
                        Remove image
                      </button>
                    )}
                    {draftImage.uploading && (
                      <div className="text-xs text-charcoal/60">
                        {draftImage.optimizing ? 'Optimizing image...' : 'Uploading image...'}
                      </div>
                    )}
                    {draftImage.uploadError && (
                      <div className="text-xs text-red-600">{draftImage.uploadError}</div>
                    )}
                  </div>
                </div>
                <input
                  ref={createImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void startImageUpload(file, setDraftImage);
                    }
                    if (createImageInputRef.current) {
                      createImageInputRef.current.value = '';
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-charcoal/80">
                  <input
                    type="checkbox"
                    {...register('showOnSoldProducts')}
                    disabled={!draftImage.url}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className={draftImage.url ? '' : 'opacity-50'}>Display Custom Order On Sold Products</span>
                </label>
                {!draftImage.url && (
                  <p className="text-xs text-charcoal/60">Upload an image to enable this option.</p>
                )}
              </div>

              <div>
                <label className="lux-label mb-2 block">Amount (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('amount', { required: true })}
                  className="lux-input text-sm"
                />
              </div>

              <div>
                <label className="lux-label mb-2 block">Shipping (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('shipping')}
                  className="lux-input text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="lux-button--ghost px-4 py-2 text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formState.isSubmitting || draftImage.uploading || !!draftImage.uploadError}
                  className="lux-button px-4 py-2 text-[10px] disabled:opacity-60"
                >
                  {formState.isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};




