import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BannerMessage } from '../components/BannerMessage';
import { fetchCheckoutSession } from '../lib/api';
import { useCartStore } from '../store/cartStore';

type SessionStatus = 'loading' | 'success' | 'pending' | 'failed';

const formatCurrency = (amountCents?: number, currency: string = 'usd') => {
  if (amountCents == null) return '';
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
};
const formatShipping = (amountCents?: number, currency: string = 'usd') => {
  if (amountCents == null) return '';
  if (amountCents <= 0) return 'FREE';
  return formatCurrency(amountCents, currency);
};

export function CheckoutReturnPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Awaited<ReturnType<typeof fetchCheckoutSession>> | null>(null);
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!sessionId) {
        setError('Missing checkout session.');
        setStatus('failed');
        return;
      }

      try {
        const result = await fetchCheckoutSession(sessionId);
        if (isCancelled) return;

        setSession(result);
        const isPaid = !result?.paymentStatus || result.paymentStatus === 'paid';
        if (!isPaid) {
          setStatus('pending');
          return;
        }
        clearCart();
        setStatus('success');
      } catch (err) {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to verify your payment.';
        setError(message);
        setStatus('failed');
      }
    };

    load();
    return () => {
      isCancelled = true;
    };
  }, [sessionId]);

  const renderContent = () => {
    if (status === 'loading') {
      return (
        <div className="text-center text-charcoal/70">Confirming your payment...</div>
      );
    }

    if (status === 'success' && session) {
      return (
        <>
          <h1 className="text-3xl font-serif font-semibold text-deep-ocean text-center mb-3">Thank you!</h1>
          <p className="text-charcoal/80 text-center mb-6">
            {session.customerEmail
              ? `A confirmation has been sent to ${session.customerEmail}.`
              : 'Your payment was successful.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="md:col-span-2 lux-card bg-white/92 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-semibold text-deep-ocean">Order Summary</h2>
              </div>
              <div className="divide-y divide-driftwood/60">
                {session.lineItems && session.lineItems.length > 0 ? (
                  session.lineItems
                    .filter((item) => !item.isShipping)
                    .map((item, idx) => {
                      const isCustomOrderItem =
                        (item.productName || '').toLowerCase().startsWith('custom order');
                      const showQuantity = !item.oneOff && !isCustomOrderItem;
                      const quantity = item.quantity || 1;
                      return (
                        <div key={idx} className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.productName || 'Item'}
                                className="w-14 h-14 rounded-shell object-cover bg-sand border border-driftwood/60"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-shell bg-sand border border-driftwood/60" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-deep-ocean truncate">{item.productName}</p>
                              {item.optionGroupLabel && item.optionValue && (
                                <p className="text-xs text-charcoal/70">
                                  {item.optionGroupLabel}: {item.optionValue}
                                </p>
                              )}
                              {showQuantity && (
                                <p className="text-xs text-charcoal/70">Qty: {quantity}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-deep-ocean text-right">
                            {session.currency
                              ? formatCurrency(item.lineSubtotal ?? item.lineTotal, session.currency)
                              : item.lineSubtotal ?? item.lineTotal}
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-charcoal/70">No line items found.</p>
                )}
              </div>
              {session.currency && (
                <>
                  <div className="mt-4 flex items-center justify-between text-sm text-charcoal/80">
                    <span>Subtotal</span>
                    <span className="font-medium">
                      {formatCurrency(session.amountSubtotal ?? 0, session.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-charcoal/80">
                    <span>Shipping</span>
                    <span className="font-medium">
                      {formatShipping(session.amountShipping ?? 0, session.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-charcoal/80">
                    <span>Tax</span>
                    <span className="font-medium">
                      {formatCurrency(session.amountTax ?? 0, session.currency)}
                    </span>
                  </div>
                  {session.amountDiscount && session.amountDiscount > 0 ? (
                    <div className="mt-2 flex items-center justify-between text-sm text-charcoal/80">
                      <span>Discount</span>
                      <span className="font-medium">-{formatCurrency(session.amountDiscount, session.currency)}</span>
                    </div>
                  ) : null}
                </>
              )}
              {session.currency && session.amountTotal != null && (
                <div className="mt-2 pt-4 border-t border-driftwood/70 flex items-center justify-between">
                  <span className="text-sm font-semibold text-deep-ocean">Order total</span>
                  <span className="text-base font-bold text-deep-ocean">
                    {formatCurrency(session.amountTotal, session.currency)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="lux-card bg-white/92 p-4">
                <h3 className="text-sm font-semibold text-deep-ocean mb-2 uppercase tracking-[0.16em]">Shipping</h3>
                {session.shipping ? (
                  <div className="text-sm text-charcoal/80 space-y-1">
                    {session.shipping.name && <p className="font-medium">{session.shipping.name}</p>}
                    {session.shipping.address && (
                      <div className="text-charcoal/70">
                        {session.shipping.address.line1 && <p>{session.shipping.address.line1}</p>}
                        {session.shipping.address.line2 && <p>{session.shipping.address.line2}</p>}
                        {(session.shipping.address.city || session.shipping.address.state || session.shipping.address.postal_code) && (
                          <p>
                            {[session.shipping.address.city, session.shipping.address.state, session.shipping.address.postal_code]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        )}
                        {session.shipping.address.country && <p>{session.shipping.address.country}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-charcoal/70">No shipping details available.</p>
                )}
              </div>

              <div className="lux-card bg-white/92 p-4">
                <h3 className="text-sm font-semibold text-deep-ocean mb-2 uppercase tracking-[0.16em]">Payment</h3>
                <div className="text-sm text-charcoal/80 space-y-1">
                  <p>
                    Payment method:{' '}
                    {session.paymentMethodLabel ||
                      session.paymentMethodType ||
                      'Unknown'}
                  </p>
                  {(session.cardLast4 || session.paymentLast4) && (
                    <p>
                      Card ending in {session.cardLast4 || session.paymentLast4}
                      {session.paymentBrand ? ` (${session.paymentBrand})` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <Link
              to="/shop"
              className="lux-button"
            >
              Continue Shopping
            </Link>
          </div>
        </>
      );
    }

    if (status === 'pending') {
      return (
        <>
          <h1 className="text-3xl font-serif font-semibold text-deep-ocean text-center mb-3">Payment Processing</h1>
          <p className="text-charcoal/80 text-center mb-6">
            We&apos;re finalizing your payment. You can safely close this tab; we&apos;ll email you once it completes.
          </p>
          <div className="flex justify-center">
            <Link
              to="/shop"
              className="lux-button"
            >
              Back to Shop
            </Link>
          </div>
        </>
      );
    }

    return (
      <>
        <h1 className="text-3xl font-serif font-semibold text-deep-ocean text-center mb-3">Payment Failed</h1>
        <p className="text-charcoal/80 text-center mb-6">
          We couldn&apos;t confirm your payment. Please try again or use a different card.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            to="/checkout"
            className="lux-button"
          >
            Retry Checkout
          </Link>
          <Link
            to="/shop"
            className="lux-button--ghost"
          >
            Back to Shop
          </Link>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-linen py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {error && <BannerMessage message={error} type="error" />}
        <div className="lux-card bg-white/94 p-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
