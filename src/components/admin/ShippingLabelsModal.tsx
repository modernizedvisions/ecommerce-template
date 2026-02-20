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

type ParcelUiAction = 'quotes' | 'buy' | 'refresh';

type ParcelUiStatus =
  | { state: 'idle' }
  | { state: 'loading'; action: ParcelUiAction }
  | { state: 'success'; action: ParcelUiAction; message: string }
  | { state: 'error'; action: ParcelUiAction; message: string; subtext?: string };

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

const trimText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const formatCurrency = (cents: number | null | undefined, currency = 'USD') => {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

const getInitials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'IT';

const NO_QUOTES_PRIMARY = 'No quotes found for this package. Try a different box size or weight.';
const NO_QUOTES_SUBTEXT = 'If it still fails, try pricing it in Easyship directly.';
const EASYSHIP_RATE_LIMIT_MESSAGE = 'Too many requests to Easyship. Refresh and try again in a moment.';

const extractErrorMessage = (errorLike: unknown): string => {
  if (errorLike instanceof Error) return errorLike.message || 'Operation failed.';
  return String(errorLike || 'Operation failed.');
};

const hasStatus429 = (errorLike: unknown): boolean => {
  if (!errorLike || typeof errorLike !== 'object') return false;
  const maybeStatus = (errorLike as { status?: unknown }).status;
  return typeof maybeStatus === 'number' && maybeStatus === 429;
};

const isEasyshipRateLimitError = (errorLike: unknown, message: string): boolean => {
  if (hasStatus429(errorLike)) return true;
  const normalized = message.toLowerCase();
  if (normalized.includes('rate limit exceeded')) return true;
  if (normalized.includes('429') && normalized.includes('maximum number of requests')) return true;
  return false;
};

const isNoQuotesFailure = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('no_quotes') ||
    normalized.includes('no_rates') ||
    normalized.includes('no supported carrier quotes') ||
    normalized.includes('no shipping solutions') ||
    normalized.includes('no rate available for label purchase')
  );
};

const normalizeParcelActionError = (errorLike: unknown): { message: string; subtext?: string } => {
  const message = extractErrorMessage(errorLike);
  if (isEasyshipRateLimitError(errorLike, message)) {
    return { message: EASYSHIP_RATE_LIMIT_MESSAGE };
  }
  if (isNoQuotesFailure(message)) {
    return {
      message: NO_QUOTES_PRIMARY,
      subtext: NO_QUOTES_SUBTEXT,
    };
  }
  return { message };
};

const getLoadingMessage = (action: ParcelUiAction): string => {
  if (action === 'quotes') return 'Fetching Quotes...';
  if (action === 'buy') return 'Buying Label...';
  return 'Refreshing Label...';
};

const toDisplayMeasurement = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const formatMeasurement = (value: number | null): string => {
  if (value === null) return '\u2014';
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
};

const initialDraftFromShipment = (shipment: OrderShipment): ParcelDraft => ({
  boxPresetId: shipment.boxPresetId || '',
  useCustom:
    shipment.customLengthIn !== null || shipment.customWidthIn !== null || shipment.customHeightIn !== null,
  // Keep custom inputs session-local; do not prefill from effective/preset-derived values.
  customLengthIn: '',
  customWidthIn: '',
  customHeightIn: '',
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
  const [, setPostBuyByShipment] = useState<Record<string, boolean>>({});
  const [parcelStatusById, setParcelStatusById] = useState<Record<string, ParcelUiStatus>>({});
  const [busyByShipment, setBusyByShipment] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string>('');

  const orderId = order?.id || null;
  const missingShipFrom = useMemo(() => requiredShipFromMissing(shipFrom), [shipFrom]);
  const shipFromReady = missingShipFrom.length === 0;
  const orderCurrency = order?.currency || 'USD';

  const setLoading = (parcelId: string, action: ParcelUiAction) => {
    setParcelStatusById((prev) => ({ ...prev, [parcelId]: { state: 'loading', action } }));
  };

  const setSuccess = (parcelId: string, action: ParcelUiAction, message: string) => {
    setParcelStatusById((prev) => ({ ...prev, [parcelId]: { state: 'success', action, message } }));
  };

  const setParcelError = (parcelId: string, action: ParcelUiAction, message: string, subtext?: string) => {
    setParcelStatusById((prev) => ({ ...prev, [parcelId]: { state: 'error', action, message, subtext } }));
  };

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

  useEffect(() => {
    setParcelStatusById((prev) => {
      const next: Record<string, ParcelUiStatus> = {};
      shipments.forEach((shipment) => {
        next[shipment.id] = prev[shipment.id] || { state: 'idle' };
      });
      return next;
    });
  }, [shipments]);

  useEffect(() => {
    if (open) return;
    setParcelStatusById({});
    setPostBuyByShipment({});
    setBusyByShipment({});
    setError('');
  }, [open]);

  const withShipmentBusy = async (shipmentId: string, label: string, task: () => Promise<void>) => {
    setBusyByShipment((prev) => ({ ...prev, [shipmentId]: label }));
    setError('');
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

  const toggleCustomDimensions = (shipmentId: string, enabled: boolean) => {
    setDrafts((prev) => {
      const existing = prev[shipmentId] || {
        boxPresetId: '',
        useCustom: false,
        customLengthIn: '',
        customWidthIn: '',
        customHeightIn: '',
        weightLb: '',
      };
      const next = { ...existing, useCustom: enabled };
      if (enabled) {
        // If no session-entered custom values exist, initialize as blank (never pull preset/effective dims).
        if (
          !next.customLengthIn.trim() &&
          !next.customWidthIn.trim() &&
          !next.customHeightIn.trim()
        ) {
          next.customLengthIn = '';
          next.customWidthIn = '';
          next.customHeightIn = '';
        }
      }
      return { ...prev, [shipmentId]: next };
    });
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
      setPostBuyByShipment((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
      setParcelStatusById((prev) => {
        const next = { ...prev };
        delete next[shipment.id];
        return next;
      });
    });
  };

  const handleGetQuotes = async (shipment: OrderShipment) => {
    if (!orderId) return;
    setLoading(shipment.id, 'quotes');
    setQuoteWarningByShipment((prev) => {
      const next = { ...prev };
      delete next[shipment.id];
      return next;
    });
    try {
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
      if (quoted.warning || quoted.rates.length === 0) {
        const normalized = normalizeParcelActionError(quoted.warning || 'NO_QUOTES');
        setQuoteWarningByShipment((prev) => ({ ...prev, [shipment.id]: normalized.message }));
        setParcelError(shipment.id, 'quotes', normalized.message, normalized.subtext);
      } else {
        setQuoteWarningByShipment((prev) => {
          const next = { ...prev };
          delete next[shipment.id];
          return next;
        });
        setSuccess(shipment.id, 'quotes', 'Quotes Fetched.');
      }
    } catch (quoteError) {
      const normalized = normalizeParcelActionError(quoteError);
      if (normalized.subtext) {
        setQuoteWarningByShipment((prev) => ({ ...prev, [shipment.id]: normalized.message }));
      }
      setParcelError(shipment.id, 'quotes', normalized.message, normalized.subtext);
    }
  };

  const handleBuyLabel = async (shipment: OrderShipment) => {
    if (!orderId) return;
    setLoading(shipment.id, 'buy');
    try {
      if (quoteWarningByShipment[shipment.id]) {
        throw new Error(quoteWarningByShipment[shipment.id]);
      }
      await persistShipmentDraft(shipment.id);
      const selectedQuoteId = selectedQuoteByShipment[shipment.id] || null;
      const bought = await adminBuyShipmentLabel(orderId, shipment.id, {
        quoteSelectedId: selectedQuoteId,
      });
      setPostBuyByShipment((prev) => ({ ...prev, [shipment.id]: true }));
      setShipments(bought.shipments);
      seedDrafts(bought.shipments);
      if (bought.selectedQuoteId) {
        setSelectedQuoteByShipment((prev) => ({ ...prev, [shipment.id]: bought.selectedQuoteId }));
      }
      const updatedShipment =
        (bought.shipment && bought.shipment.id === shipment.id ? bought.shipment : null) ||
        bought.shipments.find((entry) => entry.id === shipment.id) ||
        null;
      const hasLabelUrl = !!trimText(updatedShipment?.labelUrl);
      setSuccess(
        shipment.id,
        'buy',
        hasLabelUrl ? 'Label purchased.' : 'Label Purchased. Refresh to Download.'
      );
    } catch (buyError) {
      const normalized = normalizeParcelActionError(buyError);
      setParcelError(shipment.id, 'buy', normalized.message, normalized.subtext);
    }
  };

  const handleRefreshLabel = async (shipment: OrderShipment) => {
    if (!orderId) return;
    setLoading(shipment.id, 'refresh');
    try {
      const refreshed = await adminFetchShipmentLabelStatus(orderId, shipment.id);
      setShipments(refreshed.shipments);
      seedDrafts(refreshed.shipments);
      setSuccess(
        shipment.id,
        'refresh',
        refreshed.pendingRefresh
          ? 'Label still generating. Try refresh again shortly.'
          : refreshed.refreshed
          ? 'Refresh Complete — Label is Ready.'
          : 'Label status is up to date.'
      );
    } catch (refreshError) {
      const normalized = normalizeParcelActionError(refreshError);
      setParcelError(shipment.id, 'refresh', normalized.message, normalized.subtext);
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

          {isLoading ? (
            <div className="flex items-center gap-2 text-charcoal/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading shipping data...
            </div>
          ) : (
            <>
              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-2">Items</p>
                {Array.isArray(order.items) && order.items.length > 0 ? (
                  <div className="space-y-2">
                    {order.items.map((item, index) => {
                      const quantity = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1;
                      const unitPriceCents = Number.isFinite(Number(item.priceCents)) ? Number(item.priceCents) : 0;
                      const lineTotalCents = unitPriceCents * quantity;
                      const name = item.productName || item.customOrderDisplayId || item.productId || 'Item';
                      const imageUrl = item.productImageUrl || item.imageUrl || null;
                      return (
                        <div
                          key={`${item.productId || 'item'}-${index}`}
                          className="flex items-center gap-3 rounded-shell border border-driftwood/60 bg-white/80 px-3 py-2"
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-shell border border-driftwood/60 bg-linen/70">
                            {imageUrl ? (
                              <img src={imageUrl} alt={name} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-charcoal/60">
                                {getInitials(name)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-charcoal">{name}</div>
                            <div className="text-xs text-charcoal/70">
                              Qty: {quantity} - {formatCurrency(unitPriceCents, orderCurrency)}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold text-charcoal">
                            {formatCurrency(lineTotalCents, orderCurrency)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-charcoal/60">Items unavailable for this order.</div>
                )}
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
                    const isComplete =
                      shipment.labelState === 'generated' ||
                      !!shipment.purchasedAt ||
                      !!shipment.labelUrl;
                    const canRemove = !shipment.purchasedAt && shipment.labelState !== 'generated';
                    const pendingRefresh = shipment.labelState === 'pending' && !!shipment.easyshipShipmentId;
                    const canBuyLabel = !shipment.purchasedAt && shipment.labelState !== 'generated';
                    const parcelStatus = parcelStatusById[shipment.id] || { state: 'idle' };
                    const parcelStatusMessage =
                      parcelStatus.state === 'loading' ? getLoadingMessage(parcelStatus.action) : parcelStatus.state === 'idle' ? '' : parcelStatus.message;
                    const parcelStatusTitle =
                      parcelStatus.state === 'error'
                        ? [parcelStatus.message, parcelStatus.subtext].filter(Boolean).join(' ')
                        : parcelStatusMessage;
                    const isParcelLoading = parcelStatus.state === 'loading';
                    const selectedPresetId = draft.useCustom
                      ? null
                      : trimText(draft.boxPresetId) || trimText(shipment.boxPresetId);
                    const selectedPreset = selectedPresetId
                      ? boxPresets.find((preset) => preset.id === selectedPresetId) || null
                      : null;
                    const boxLabel = draft.useCustom
                      ? 'Custom Box'
                      : trimText(selectedPreset?.name) || trimText(shipment.boxPresetName) || 'Box Not Selected';
                    const displayLength = draft.useCustom
                      ? toDisplayMeasurement(draft.customLengthIn)
                      : selectedPreset
                      ? toDisplayMeasurement(selectedPreset.lengthIn)
                      : toDisplayMeasurement(shipment.effectiveLengthIn) ??
                        toDisplayMeasurement(shipment.customLengthIn);
                    const displayWidth = draft.useCustom
                      ? toDisplayMeasurement(draft.customWidthIn)
                      : selectedPreset
                      ? toDisplayMeasurement(selectedPreset.widthIn)
                      : toDisplayMeasurement(shipment.effectiveWidthIn) ??
                        toDisplayMeasurement(shipment.customWidthIn);
                    const displayHeight = draft.useCustom
                      ? toDisplayMeasurement(draft.customHeightIn)
                      : selectedPreset
                      ? toDisplayMeasurement(selectedPreset.heightIn)
                      : toDisplayMeasurement(shipment.effectiveHeightIn) ??
                        toDisplayMeasurement(shipment.customHeightIn);
                    const displayWeight = toDisplayMeasurement(draft.weightLb) ?? toDisplayMeasurement(shipment.weightLb);
                    const parcelSummaryLine = `${formatMeasurement(displayLength)} \u00d7 ${formatMeasurement(displayWidth)} \u00d7 ${formatMeasurement(displayHeight)} in \u2022 ${formatMeasurement(displayWeight)} lb`;
                    const carrierDisplayText = (() => {
                      const carrier = trimText(shipment.carrier);
                      if (carrier) return carrier;
                      return 'Carrier Not Selected';
                    })();
                    const downloadDisabledTitle = 'No label yet';
                    return (
                      <div key={shipment.id} className="lux-panel p-4">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-charcoal">Parcel #{shipment.parcelIndex}</h4>
                            {parcelStatus.state !== 'idle' && (
                              <div
                                title={parcelStatusTitle}
                                className={`max-w-[360px] rounded-shell border px-2 py-1 text-[11px] leading-snug ${
                                  parcelStatus.state === 'loading'
                                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                                    : parcelStatus.state === 'success'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                    : 'border-rose-300 bg-rose-50 text-rose-800'
                                }`}
                              >
                                <div className="flex items-center gap-1">
                                  {parcelStatus.state === 'loading' && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                                  <span className="break-words">{parcelStatusMessage}</span>
                                </div>
                                {parcelStatus.state === 'error' && parcelStatus.subtext && (
                                  <div className="mt-0.5 text-[10px] text-rose-700/90 break-words">{parcelStatus.subtext}</div>
                                )}
                              </div>
                            )}
                          </div>
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
                                title={downloadDisabledTitle}
                                disabled
                                className="lux-button--ghost px-3 py-2 text-[10px] opacity-50 cursor-not-allowed"
                              >
                                Download Label (PDF)
                              </button>
                            )}
                            {!isComplete && (
                              <button
                                type="button"
                                className="lux-button--ghost px-3 py-2 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!canBuyLabel || isParcelLoading}
                                onClick={() => void handleGetQuotes(shipment)}
                              >
                                Get Quotes
                              </button>
                            )}
                            {!isComplete && (
                              <button
                                type="button"
                                className="lux-button px-3 py-2 text-[10px]"
                                disabled={!shipFromReady || !!quoteWarning || !canBuyLabel || isParcelLoading}
                                onClick={() => void handleBuyLabel(shipment)}
                              >
                                Buy Label
                              </button>
                            )}
                            {!isComplete && canRemove && (
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

                        <div className="mt-3 rounded-shell border border-driftwood/60 bg-white/80 p-3">
                          <p className="lux-heading !text-sm sm:!text-sm !leading-tight !text-charcoal uppercase tracking-[0.12em]">{boxLabel}</p>
                          <p className="mt-1 text-xs text-charcoal/70">{parcelSummaryLine}</p>
                        </div>

                        {!isComplete && (
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
                                  onChange={(e) => toggleCustomDimensions(shipment.id, e.target.checked)}
                                />
                                Use Custom Dimensions
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
                        )}

                        {!isComplete && (
                          <>
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
                          </>
                        )}

                        <div className="mt-3 rounded-shell border border-driftwood/60 bg-white/80 p-3 text-sm">
                          {(() => {
                            const trackingValue = trimText(shipment.trackingNumber);
                            const displayText = trackingValue || 'Pending';
                            return (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <p className="lux-label text-[10px]">TRACKING:</p>
                                  <div
                                    className={`text-xs ${
                                      trackingValue ? 'font-mono text-charcoal font-medium' : 'text-charcoal/70'
                                    }`}
                                  >
                                    {displayText}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="lux-label text-[10px]">Carrier:</p>
                                  <div className="text-[11px] text-charcoal/60">{carrierDisplayText}</div>
                                </div>
                              </div>
                            );
                          })()}
                          {!isComplete && (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {pendingRefresh ? (
                                  <>
                                    <span className="text-xs text-amber-800">Generating...</span>
                                    <button
                                      type="button"
                                      className="lux-button--ghost px-3 py-1 text-[10px] disabled:opacity-50"
                                      disabled={isParcelLoading}
                                      onClick={() => void handleRefreshLabel(shipment)}
                                    >
                                      <RefreshCcw className="h-4 w-4" />
                                      Refresh
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          )}
                          {shipment.labelCostAmountCents !== null && (
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-emerald-800">
                              <span>Cost: {formatCurrency(shipment.labelCostAmountCents, shipment.labelCurrency)}</span>
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
