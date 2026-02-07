import React, { useEffect, useMemo, useState } from 'react';
import type { AdminOrder } from '../../lib/db/orders';
import { formatEasternDateTime } from '../../lib/dates';

interface OrderDetailsModalProps {
  open: boolean;
  order: AdminOrder | null;
  onClose: () => void;
}

const formatCurrency = (cents: number | null | undefined, currency: string = 'usd') => {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

export function OrderDetailsModal({ open, order, onClose }: OrderDetailsModalProps) {
  if (!open || !order) return null;

  const idLabel = order.displayOrderId || order.id?.slice(0, 8) || 'Order';
  const placedAt = order.createdAt ? formatEasternDateTime(order.createdAt) : 'Unknown date';
  const customerName = order.shippingName || order.customerName || 'Customer';
  const customerEmail = order.customerEmail || 'No email provided';
  const hasPromo =
    !!order.promoCode ||
    !!order.promoSource ||
    (order.promoPercentOff !== null && order.promoPercentOff !== undefined && order.promoPercentOff > 0) ||
    order.promoFreeShipping === true;

  const shipping = order.shippingAddress;
  const hasShipping = !!shipping;

  const [itemImages, setItemImages] = useState<Record<string, string>>({});

  const CUSTOM_ORDER_PREFIXES = ['custom_order:', 'custom-order:', 'custom order:'];

  const isShippingItem = (item: any) => {
    const name = (item.productName || '').toLowerCase();
    const pid = (item.productId || '').toLowerCase();
    return name.includes('shipping') || pid === 'shipping' || pid === 'ship' || pid === 'shipping_line';
  };
  const hasCustomOrderToken = (value: string) =>
    CUSTOM_ORDER_PREFIXES.some((prefix) => value.toLowerCase().startsWith(prefix));
  const isCustomOrderItem = (item: any) => {
    const pid = (item.productId || '').toString();
    const name = (item.productName || '').toString();
    return hasCustomOrderToken(pid) || hasCustomOrderToken(name);
  };
  const getDisplayItemName = (item: any) => {
    const rawName = (item.productName || item.productId || '').toString();
    if (!isCustomOrderItem(item)) return rawName || 'Item';
    const displayId =
      item.customOrderDisplayId || item.displayCustomOrderId || item.customOrderNumber || null;
    return displayId || 'Custom Order';
  };

  const rawItems = useMemo(() => {
    if (Array.isArray(order.items) && order.items.length) return order.items;
    return [
      {
        productId: 'item',
        productName: 'Item',
        quantity: 1,
        priceCents: order.totalCents || 0,
      },
    ];
  }, [order]);

  useEffect(() => {
    const fetchImages = async () => {
      const missing = rawItems.filter(
        (i) =>
          i.productId &&
          !isShippingItem(i) &&
          !isCustomOrderItem(i) &&
          !i.productImageUrl &&
          !i.imageUrl &&
          !itemImages[i.productId as string]
      );
      for (const itm of missing) {
        try {
          const res = await fetch(`/api/products/${itm.productId}`);
          if (!res.ok) continue;
          const data = await res.json();
          const url =
            data?.image_url ||
            (Array.isArray(data?.images) ? data.images[0] : null) ||
            (Array.isArray(data?.image_urls) ? data.image_urls[0] : null) ||
            null;
          if (url) {
            setItemImages((prev) => ({ ...prev, [itm.productId as string]: url }));
          }
        } catch {
          // ignore failures
        }
      }
    };
    fetchImages();
  }, [rawItems, itemImages]);

  const shippingFromItems = rawItems
    .filter(isShippingItem)
    .reduce((sum, item) => sum + (item.priceCents || 0) * (item.quantity || 1), 0);

  const items = rawItems
    .filter((i) => !isShippingItem(i))
    .map((i) => ({
      ...i,
      productImageUrl:
        i.imageUrl ||
        i.productImageUrl ||
        (i.productId ? itemImages[i.productId] : undefined),
    }));

  const currency = order.currency || 'usd';
  const lineTotal = (qty: number, priceCents: number) => formatCurrency((qty || 0) * (priceCents || 0), currency);
  const itemsSubtotalCents = items.reduce((sum, item) => sum + (item.priceCents || 0) * (item.quantity || 1), 0);
  const hasCanonicalTotals =
    typeof order.amountTotalCents === 'number' ||
    typeof order.amountSubtotalCents === 'number' ||
    typeof order.amountShippingCents === 'number' ||
    typeof order.amountTaxCents === 'number' ||
    typeof order.amountDiscountCents === 'number';
  const legacyShippingCents =
    typeof order.shippingCents === 'number'
      ? order.shippingCents
      : shippingFromItems > 0
      ? shippingFromItems
      : 0;
  const subtotalCents = hasCanonicalTotals ? order.amountSubtotalCents ?? itemsSubtotalCents : itemsSubtotalCents;
  const shippingCents = hasCanonicalTotals ? order.amountShippingCents ?? legacyShippingCents : legacyShippingCents;
  const taxCents = hasCanonicalTotals ? order.amountTaxCents ?? 0 : null;
  const discountCents = hasCanonicalTotals ? order.amountDiscountCents ?? 0 : null;
  const totalCents = order.amountTotalCents ?? order.totalCents ?? 0;

  const formattedAddress = hasShipping
    ? [
        shipping?.line1,
        shipping?.line2,
        [shipping?.city, shipping?.state, shipping?.postal_code].filter(Boolean).join(', '),
        shipping?.country,
      ]
        .filter((line) => (line || '').toString().trim().length > 0)
        .join('\n') || 'Shipping address not provided'
    : 'No shipping address provided.';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-deep-ocean/40 px-3 py-6 backdrop-blur-[2px]">
      <div className="lux-card bg-white relative w-full max-w-xl p-6 max-h-[85vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 lux-button--ghost px-3 py-1 text-[10px]"
        >
          CLOSE
        </button>

        <div className="space-y-5">
          <div>
            <p className="lux-label text-[10px] mb-1">Order</p>
            <div className="text-xl font-semibold text-charcoal">Order {idLabel}</div>
            <p className="text-sm text-charcoal/70">Placed {placedAt}</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <section className="lux-panel p-4">
              <p className="lux-label text-[10px] mb-1.5">Customer</p>
              <div className="space-y-1 text-sm text-charcoal/80">
                <div className="font-medium text-charcoal">{customerName}</div>
                <div className="text-charcoal/70">{customerEmail}</div>
                <div className="text-charcoal/70 whitespace-pre-line">{formattedAddress}</div>
              </div>
            </section>

            <section className="lux-panel p-4">
              <p className="lux-label text-[10px] mb-2">Order Status</p>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center rounded-ui bg-emerald-50 px-3 py-1 text-emerald-700 border border-emerald-100">
                  Completed
                </span>
                <span className="inline-flex items-center rounded-ui bg-blue-50 px-3 py-1 text-blue-700 border border-blue-100">
                  Paid
                </span>
                <span className="inline-flex items-center rounded-ui bg-linen/80 px-3 py-1 text-charcoal/80 border border-driftwood/60">
                  {placedAt}
                </span>
              </div>
            </section>

            <section className="lux-panel p-4">
              <p className="lux-label text-[10px] mb-2">Items</p>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-shell bg-linen/80 border border-driftwood/60 overflow-hidden">
                        {item.productImageUrl ? (
                          <img
                            src={item.productImageUrl}
                            alt={item.productName || 'Product'}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-charcoal truncate">
                          {getDisplayItemName(item)}
                        </div>
                        {item.optionGroupLabel && item.optionValue && (
                          <div className="text-xs text-charcoal/70">
                            {item.optionGroupLabel}: {item.optionValue}
                          </div>
                        )}
                        <div className="text-xs text-charcoal/70">
                          Qty: {item.quantity || 0} — {formatCurrency(item.priceCents, currency)}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-charcoal whitespace-nowrap">
                      {lineTotal(item.quantity, item.priceCents)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="lux-panel p-4">
              <p className="lux-label text-[10px] mb-2">Totals</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-charcoal/70">Subtotal</span>
                  <span className="font-medium text-charcoal">{formatCurrency(subtotalCents, currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-charcoal/70">Shipping</span>
                  <span className="font-medium text-charcoal">{formatCurrency(shippingCents, currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-charcoal/70">Tax</span>
                  <span className="font-medium text-charcoal">
                    {taxCents === null ? '—' : formatCurrency(taxCents, currency)}
                  </span>
                </div>
                {discountCents && discountCents > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal/70">Discount</span>
                    <span className="font-medium text-charcoal">-{formatCurrency(discountCents, currency)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1 border-t border-driftwood/60">
                  <span className="font-semibold text-charcoal">Total</span>
                  <span className="font-semibold text-charcoal">{formatCurrency(totalCents, currency)}</span>
                </div>
              </div>
            </section>

            {hasPromo && (
              <section className="lux-panel p-4">
                <p className="lux-label text-[10px] mb-2">Promotions</p>
                <div className="space-y-2 text-sm">
                  {order.promoCode ? (
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal/70">Promo code</span>
                      <span className="font-medium text-charcoal">{order.promoCode.toUpperCase()}</span>
                    </div>
                  ) : null}
                  {order.promoPercentOff !== null && order.promoPercentOff !== undefined ? (
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal/70">Percent off</span>
                      <span className="font-medium text-charcoal">{order.promoPercentOff}%</span>
                    </div>
                  ) : null}
                  {order.promoFreeShipping !== null && order.promoFreeShipping !== undefined ? (
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal/70">Free shipping</span>
                      <span className="font-medium text-charcoal">{order.promoFreeShipping ? 'Yes' : 'No'}</span>
                    </div>
                  ) : null}
                  {order.promoSource ? (
                    <div className="flex items-center justify-between">
                      <span className="text-charcoal/70">Source</span>
                      <span className="font-medium text-charcoal">{order.promoSource}</span>
                    </div>
                  ) : null}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
