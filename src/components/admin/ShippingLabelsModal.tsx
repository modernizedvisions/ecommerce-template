import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import type { AdminOrder } from '../../lib/db/orders';
import {
  adminBuyShipmentLabel,
  adminCreateOrderShipment,
  adminDeleteOrderShipment,
  adminFetchOrderShipments,
  adminFetchShipmentLabelStatus,
  adminFetchShipmentQuotes,
  adminFetchShippingSettings,
  adminUpdateOrderShipment,
  type OrderShipment,
  type ShipmentQuote,
  type ShipmentQuoteDebugHints,
  type ShipFromSettings,
  type ShippingBoxPreset,
} from '../../lib/adminShipping';

type ParcelDraft = {
  boxPresetId: string;
  useCustom: boolean;
  customLengthIn: string;
  customWidthIn: string;
  customHeightIn: string;
  weightLb: string;
};

interface ShippingLabelsModalProps {
  open: boolean;
  order: AdminOrder | null;
  onClose: () => void;
  onOpenSettings: () => void;
}

const requiredShipFromMissing = (shipFrom: ShipFromSettings | null): string[] => {
  if (!shipFrom) return ['shipFrom'];
  const missing: string[] = [];
  if (!shipFrom.shipFromName.trim()) missing.push('name');
  if (!shipFrom.shipFromAddress1.trim()) missing.push('address1');
  if (!shipFrom.shipFromCity.trim()) missing.push('city');
  if (!shipFrom.shipFromState.trim()) missing.push('state');
  if (!shipFrom.shipFromPostal.trim()) missing.push('postal');
  if (!shipFrom.shipFromCountry.trim()) missing.push('country');
  return missing;
};

const toNumberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatCurrency = (cents: number | null | undefined, currency = 'USD') => {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

const initialDraftFromShipment = (shipment: OrderShipment): ParcelDraft => ({
  boxPresetId: shipment.boxPresetId || '',
  useCustom:
    shipment.customLengthIn !== null || shipment.customWidthIn !== null || shipment.customHeightIn !== null,
  customLengthIn: shipment.customLengthIn === null ? '' : String(shipment.customLengthIn),
  customWidthIn: shipment.customWidthIn === null ? '' : String(shipment.customWidthIn),
  customHeightIn: shipment.customHeightIn === null ? '' : String(shipment.customHeightIn),
  weightLb: String(shipment.weightLb ?? ''),
});

export function ShippingLabelsModal({ open, order, onClose, onOpenSettings }: ShippingLabelsModalProps) {
  const [shipFrom, setShipFrom] = useState<ShipFromSettings | null>(null);
  const [boxPresets, setBoxPresets] = useState<ShippingBoxPreset[]>([]);
  const [shipments, setShipments] = useState<OrderShipment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ParcelDraft>>({});
  const [quotesByShipment, setQuotesByShipment] = useState<Record<string, ShipmentQuote[]>>({});
  const [quoteWarningByShipment, setQuoteWarningByShipment] = useState<Record<string, string>>({});
  const [quoteDebugByShipment, setQuoteDebugByShipment] = useState<Record<string, ShipmentQuoteDebugHints | null>>({});
  const [selectedQuoteByShipment, setSelectedQuoteByShipment] = useState<Record<string, string | null>>({});
  const [busyByShipment, setBusyByShipment] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const orderId = order?.id || null;
  const missingShipFrom = useMemo(() => requiredShipFromMissing(shipFrom), [shipFrom]);
  const shipFromReady = missingShipFrom.length === 0;

  const seedDrafts = (nextShipments: OrderShipment[]) => {
    setDrafts((prev) => {
      const next: Record<string, ParcelDraft> = {};
      nextShipments.forEach((shipment) => {
        next[shipment.id] = prev[shipment.id] || initialDraftFromShipment(shipment);
      });
      return next;
    });
    setSelectedQuoteByShipment((prev) => {
      const next: Record<string, string | null> = { ...prev };
      nextShipments.forEach((shipment) => {
        if (!(shipment.id in next)) {
          next[shipment.id] = shipment.quoteSelectedId || null;
        }
      });
      return next;
    });
  };

  const loadModalData = async () => {
    if (!orderId) return;
    setIsLoading(true);
    setError('');
    try {
      const [settings, shipmentData] = await Promise.all([
        adminFetchShippingSettings(),
        adminFetchOrderShipments(orderId),
      ]);
      setShipFrom(settings.shipFrom);
      setBoxPresets(settings.boxPresets);
      setShipments(shipmentData.shipments);
      setQuoteWarningByShipment({});
      setQuoteDebugByShipment({});
      seedDrafts(shipmentData.shipments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load shipping labels data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !orderId) return;
    void loadModalData();
  }, [open, orderId]);

  const withShipmentBusy = async (shipmentId: string, label: string, task: () => Promise<void>) => {
    setBusyByShipment((prev) => ({ ...prev, [shipmentId]: label }));
    setError('');
    setSuccess('');
    try {
      await task();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : 'Operation failed.');
    } finally {
      setBusyByShipment((prev) => {
        const next = { ...prev };
        delete next[shipmentId];
        return next;
      });
    }
  };

  const updateDraft = (shipmentId: string, patch: Partial<ParcelDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [shipmentId]: {
        ...(prev[shipmentId] || {
          boxPresetId: '',
          useCustom: false,
          customLengthIn: '',
          customWidthIn: '',
          customHeightIn: '',
          weightLb: '',
        }),
        ...patch,
      },
    }));
  };

  const persistShipmentDraft = async (shipmentId: string): Promise<void> => {
    if (!orderId) return;
    const draft = drafts[shipmentId];
    if (!draft) return;

    const weightLb = toNumberOrNull(draft.weightLb);
    if (weightLb === null || weightLb <= 0) {
      throw new Error('Weight must be a positive number.');
    }

    const payload: {
      boxPresetId?: string | null;
      customLengthIn?: number | null;
      customWidthIn?: number | null;
      customHeightIn?: number | null;
      weightLb: number;
    } = { weightLb };

    if (draft.useCustom) {
      const customLengthIn = toNumberOrNull(draft.customLengthIn);
      const customWidthIn = toNumberOrNull(draft.customWidthIn);
      const customHeightIn = toNumberOrNull(draft.customHeightIn);
      if (
        customLengthIn === null ||
        customWidthIn === null ||
        customHeightIn === null ||
        customLengthIn <= 0 ||
        customWidthIn <= 0 ||
        customHeightIn <= 0
      ) {
        throw new Error('Custom length/width/height must be positive numbers.');
      }
      payload.boxPresetId = null;
      payload.customLengthIn = customLengthIn;
      payload.customWidthIn = customWidthIn;
      payload.customHeightIn = customHeightIn;
    } else {
      if (!draft.boxPresetId) {
        throw new Error('Select a box preset or enable custom dimensions.');
      }
      payload.boxPresetId = draft.boxPresetId;
      payload.customLengthIn = null;
      payload.customWidthIn = null;
      payload.customHeightIn = null;
    }

    const updated = await adminUpdateOrderShipment(orderId, shipmentId, payload);
    setShipments(updated.shipments);
    seedDrafts(updated.shipments);
  };

  const handleAddParcel = async () => {
    if (!orderId) return;
    setIsAdding(true);
    setError('');
    setSuccess('');
    try {
      const firstPreset = boxPresets[0];
      const created = await adminCreateOrderShipment(orderId, firstPreset
        ? {
            boxPresetId: firstPreset.id,
            weightLb: firstPreset.defaultWeightLb ?? 1,
          }
        : {
            customLengthIn: 8,
            customWidthIn: 8,
            customHeightIn: 8,
            weightLb: 1,
          });
      setShipments(created.shipments);
      seedDrafts(created.shipments);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to add parcel.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveParcel = async (shipment: OrderShipment) => {
    if (!orderId) return;
    await withShipmentBusy(shipment.id, 'removing', async () => {
      const updated = await adminDeleteOrderShipment(orderId, shipment.id);
      setShipments(updated);
      setQuotesByShipment((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
      setSelectedQuoteByShipment((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
      setQuoteWarningByShipment((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
      setQuoteDebugByShipment((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
    });
  };

  const handleGetQuotes = async (shipment: OrderShipment) => {
    if (!orderId) return;
    await withShipmentBusy(shipment.id, 'quoting', async () => {
      await persistShipmentDraft(shipment.id);
      const quoted = await adminFetchShipmentQuotes(orderId, shipment.id);
      setShipments(quoted.shipments);
      seedDrafts(quoted.shipments);
      setQuotesByShipment((prev) => ({ ...prev, [shipment.id]: quoted.rates }));
      setSelectedQuoteByShipment((prev) => ({
        ...prev,
        [shipment.id]: quoted.selectedQuoteId,
      }));
      setQuoteDebugByShipment((prev) => ({
        ...prev,
        [shipment.id]: quoted.rawResponseHints,
      }));
      if (quoted.warning) {
        setQuoteWarningByShipment((prev) => ({ ...prev, [shipment.id]: quoted.warning }));
        setSuccess('No rates available for this parcel.');
      } else {
        setQuoteWarningByShipment((prev) => {
          const next = { ...prev };
          delete next[shipment.id];
          return next;
        });
        setSuccess(quoted.cached ? 'Loaded cached quotes.' : 'Quotes fetched.');
      }
    });
  };

  const handleBuyLabel = async (shipment: OrderShipment) => {
    if (!orderId) return;
    await withShipmentBusy(shipment.id, 'buying', async () => {
      if (quoteWarningByShipment[shipment.id]) {
        throw new Error(quoteWarningByShipment[shipment.id]);
      }
      await persistShipmentDraft(shipment.id);
      const selectedQuoteId = selectedQuoteByShipment[shipment.id] || null;
      const bought = await adminBuyShipmentLabel(orderId, shipment.id, {
        quoteSelectedId: selectedQuoteId,
      });
      setShipments(bought.shipments);
      seedDrafts(bought.shipments);
      if (bought.selectedQuoteId) {
        setSelectedQuoteByShipment((prev) => ({ ...prev, [shipment.id]: bought.selectedQuoteId }));
      }
      setSuccess(
        bought.pendingRefresh
          ? 'Label is pending. Use Refresh to check status.'
          : 'Label purchased successfully.'
      );
    });
  };

  const handleRefreshLabel = async (shipment: OrderShipment) => {
    if (!orderId) return;
    await withShipmentBusy(shipment.id, 'refreshing', async () => {
      const refreshed = await adminFetchShipmentLabelStatus(orderId, shipment.id);
      setShipments(refreshed.shipments);
      seedDrafts(refreshed.shipments);
      setSuccess(
        refreshed.pendingRefresh
          ? 'Label still generating. Try refresh again shortly.'
          : refreshed.refreshed
          ? 'Label status refreshed.'
          : 'Label status is up to date.'
      );
    });
  };

  const handleCopyTracking = async (trackingNumber: string | null) => {
    if (!trackingNumber) return;
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setSuccess('Tracking number copied.');
    } catch {
      setError('Failed to copy tracking number.');
    }
  };

  if (!open || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep-ocean/40 px-3 py-6 backdrop-blur-[2px]">
      <div className="lux-card bg-white relative w-full max-w-5xl p-6 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 lux-button--ghost px-3 py-1 text-[10px]"
        >
          CLOSE
        </button>

        <div className="space-y-5">
          <div>
            <p className="lux-label text-[10px] mb-1">Shipping Labels</p>
            <div className="text-xl font-semibold text-charcoal">
              Order {order.displayOrderId || order.id}
            </div>
          </div>

          {error && <div className="rounded-shell bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {success && <div className="rounded-shell bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>}

          {isLoading ? (
            <div className="flex items-center gap-2 text-charcoal/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading shipping data...
            </div>
          ) : (
            <>
              <section className="lux-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="lux-label text-[10px] mb-1">Ship From</p>
                    {shipFromReady && shipFrom ? (
                      <div className="text-sm text-charcoal/80 whitespace-pre-line">
                        {shipFrom.shipFromName}
                        {'\n'}
                        {shipFrom.shipFromAddress1}
                        {shipFrom.shipFromAddress2 ? `\n${shipFrom.shipFromAddress2}` : ''}
                        {'\n'}
                        {shipFrom.shipFromCity}, {shipFrom.shipFromState} {shipFrom.shipFromPostal}
                        {'\n'}
                        {shipFrom.shipFromCountry}
                        {shipFrom.shipFromPhone ? `\n${shipFrom.shipFromPhone}` : ''}
                      </div>
                    ) : (
                      <div className="text-sm text-rose-700">
                        Ship-from settings are incomplete. Missing: {missingShipFrom.join(', ')}
                      </div>
                    )}
                  </div>
                  {!shipFromReady && (
                    <button
                      type="button"
                      className="lux-button--ghost px-3 py-1 text-[10px]"
                      onClick={onOpenSettings}
                    >
                      Open Settings
                    </button>
                  )}
                </div>
              </section>

              <div className="flex items-center justify-between">
                <p className="lux-label text-[10px]">Parcels</p>
                <button
                  type="button"
                  className="lux-button--ghost px-3 py-1 text-[10px] disabled:opacity-50"
                  disabled={isAdding}
                  onClick={() => void handleAddParcel()}
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Parcel
                </button>
              </div>

              <div className="space-y-4">
                {shipments.length === 0 ? (
                  <div className="rounded-shell border border-driftwood/60 bg-linen/70 px-4 py-5 text-sm text-charcoal/60">
                    No parcels yet. Add a parcel to begin.
                  </div>
                ) : (
                  shipments.map((shipment) => {
                    const draft = drafts[shipment.id] || initialDraftFromShipment(shipment);
                    const busyLabel = busyByShipment[shipment.id];
                    const rates = quotesByShipment[shipment.id] || [];
                    const quoteWarning = quoteWarningByShipment[shipment.id] || '';
                    const quoteDebug = quoteDebugByShipment[shipment.id] || null;
                    const selectedQuoteId = selectedQuoteByShipment[shipment.id] || shipment.quoteSelectedId || null;
                    const canRemove = !shipment.purchasedAt && shipment.labelState !== 'generated';
                    const pendingRefresh = shipment.labelState === 'pending' && !!shipment.easyshipShipmentId;
                    const canBuyLabel = !shipment.purchasedAt && shipment.labelState !== 'generated';
                    return (
                      <div key={shipment.id} className="lux-panel p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h4 className="font-semibold text-charcoal">Parcel #{shipment.parcelIndex}</h4>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {busyLabel && (
                              <span className="inline-flex items-center gap-1 text-xs text-charcoal/70">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {busyLabel}
                              </span>
                            )}
                            {shipment.labelUrl ? (
                              <a
                                href={shipment.labelUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="lux-button--ghost px-3 py-2 text-[10px]"
                              >
                                Download Label (PDF)
                              </a>
                            ) : (
                              <button
                                type="button"
                                title="You have not purchased a label yet."
                                disabled
                                className="lux-button--ghost px-3 py-2 text-[10px] opacity-50 cursor-not-allowed"
                              >
                                Download Label (PDF)
                              </button>
                            )}
                            <button
                              type="button"
                              className="lux-button--ghost px-3 py-2 text-[10px]"
                              onClick={() => void handleGetQuotes(shipment)}
                            >
                              Get Quotes
                            </button>
                            <button
                              type="button"
                              className="lux-button px-3 py-2 text-[10px]"
                              disabled={!shipFromReady || !!quoteWarning || !canBuyLabel}
                              onClick={() => void handleBuyLabel(shipment)}
                            >
                              Buy Label
                            </button>
                            {canRemove && (
                              <button
                                type="button"
                                className="lux-button--ghost px-2 py-1 text-[10px] !text-rose-700"
                                onClick={() => void handleRemoveParcel(shipment)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                          <div className="w-full max-w-[520px] space-y-3">
                            <div>
                              <label className="lux-label mb-2 block">Box Preset</label>
                              <select
                                className="lux-input w-full text-[11px] uppercase tracking-[0.2em] font-semibold"
                                disabled={draft.useCustom}
                                value={draft.boxPresetId}
                                onChange={(e) => updateDraft(shipment.id, { boxPresetId: e.target.value })}
                              >
                                <option value="">Select preset</option>
                                {boxPresets.map((preset) => (
                                  <option key={preset.id} value={preset.id}>
                                    {preset.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-charcoal/80">
                              <input
                                type="checkbox"
                                checked={draft.useCustom}
                                onChange={(e) => updateDraft(shipment.id, { useCustom: e.target.checked })}
                              />
                              Use custom dimensions
                            </label>

                            {draft.useCustom && (
                              <div className="w-full">
                                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                                  <div>
                                    <label className="lux-label mb-2 block">Length (in)</label>
                                    <input
                                      className="lux-input w-full min-w-0"
                                      value={draft.customLengthIn}
                                      onChange={(e) => updateDraft(shipment.id, { customLengthIn: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <label className="lux-label mb-2 block">Width (in)</label>
                                    <input
                                      className="lux-input w-full min-w-0"
                                      value={draft.customWidthIn}
                                      onChange={(e) => updateDraft(shipment.id, { customWidthIn: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <label className="lux-label mb-2 block">Height (in)</label>
                                    <input
                                      className="lux-input w-full min-w-0"
                                      value={draft.customHeightIn}
                                      onChange={(e) => updateDraft(shipment.id, { customHeightIn: e.target.value })}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                              <div className="w-full max-w-[240px]">
                                <label className="lux-label mb-2 block">Weight (lb)</label>
                                <input
                                  className="lux-input w-full"
                                  value={draft.weightLb}
                                  onChange={(e) => updateDraft(shipment.id, { weightLb: e.target.value })}
                                />
                              </div>
                              {draft.useCustom && (
                                <button
                                  type="button"
                                  className="lux-button--ghost px-3 py-2 text-[10px]"
                                  onClick={() =>
                                    void withShipmentBusy(shipment.id, 'saving', async () => persistShipmentDraft(shipment.id))
                                  }
                                >
                                  Save Dimensions
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {quoteWarning && (
                          <div className="mt-3 rounded-shell border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <div className="font-medium">{quoteWarning}</div>
                            <div className="text-xs text-amber-700 mt-1">
                              Verify parcel weight/dimensions, try a different preset, or test against production.
                            </div>
                            {quoteDebug && (quoteDebug.hasError || quoteDebug.status !== 200) && (
                              <details className="mt-2 rounded-shell border border-amber-200 bg-amber-100/60 px-2 py-1 text-xs text-amber-900">
                                <summary className="cursor-pointer font-medium">Details (debug)</summary>
                                <div className="mt-1">HTTP status: {quoteDebug.status}</div>
                                <div>Error code: {quoteDebug.errorCode || '-'}</div>
                                <div className="mt-1">Hint: if no couriers are available, run Easyship diagnostics endpoint.</div>
                              </details>
                            )}
                          </div>
                        )}

                        {rates.length > 0 && (
                          <div className="mt-3 rounded-shell border border-driftwood/60 bg-white/80 p-3">
                            <p className="lux-label text-[10px] mb-2">Quotes</p>
                            <div className="space-y-2">
                              {rates.map((rate) => (
                                <label
                                  key={rate.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-shell border border-driftwood/60 px-3 py-2 text-sm"
                                >
                                  <span className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name={`quote-${shipment.id}`}
                                      checked={selectedQuoteId === rate.id}
                                      onChange={() => setSelectedQuoteByShipment((prev) => ({ ...prev, [shipment.id]: rate.id }))}
                                    />
                                    <span className="font-medium text-charcoal">
                                      {rate.carrier} - {rate.service}
                                    </span>
                                  </span>
                                  <span className="text-charcoal/70">
                                    {formatCurrency(rate.amountCents, rate.currency)}
                                    {rate.etaDaysMin !== null && rate.etaDaysMax !== null
                                      ? ` | ETA ${rate.etaDaysMin}-${rate.etaDaysMax}d`
                                      : ''}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 rounded-shell border border-driftwood/60 bg-white/80 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="lux-label text-[10px]">Label</p>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {pendingRefresh ? (
                                <>
                                  <span className="text-xs text-amber-800">Generating...</span>
                                  <button
                                    type="button"
                                    className="lux-button--ghost px-3 py-1 text-[10px]"
                                    onClick={() => void handleRefreshLabel(shipment)}
                                  >
                                    <RefreshCcw className="h-4 w-4" />
                                    Refresh
                                  </button>
                                </>
                              ) : <span className="text-xs text-charcoal/60">{shipment.labelUrl ? 'Label ready' : 'No label yet'}</span>}
                            </div>
                          </div>
                          {(shipment.labelUrl || shipment.trackingNumber || shipment.labelCostAmountCents !== null) && (
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-emerald-800">
                              {(shipment.carrier || shipment.service) && (
                                <span>
                                  {shipment.carrier || '-'} {shipment.service ? `| ${shipment.service}` : ''}
                                </span>
                              )}
                              {shipment.trackingNumber && (
                                <span className="inline-flex items-center gap-2">
                                  Tracking: {shipment.trackingNumber}
                                  <button
                                    type="button"
                                    className="lux-button--ghost px-2 py-1 text-[10px]"
                                    onClick={() => void handleCopyTracking(shipment.trackingNumber)}
                                  >
                                    Copy
                                  </button>
                                </span>
                              )}
                              {shipment.labelCostAmountCents !== null && (
                                <span>Cost: {formatCurrency(shipment.labelCostAmountCents, shipment.labelCurrency)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
