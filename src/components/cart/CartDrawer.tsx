import { useEffect, useState } from 'react';
import { X, Minus, Plus, Trash2 } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUIStore } from '../../store/uiStore';
import { useNavigate } from 'react-router-dom';
import { calculateShippingCents } from '../../lib/shipping';
import { fetchCategories } from '../../lib/api';
import type { Category } from '../../lib/types';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '../../lib/promotions';

export function CartDrawer() {
  const isOpen = useUIStore((state) => state.isCartDrawerOpen);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const navigate = useNavigate();
  const { promotion } = usePromotions();

  const [isVisible, setIsVisible] = useState(isOpen);
  const [isActive, setIsActive] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      const raf = requestAnimationFrame(() => setIsActive(true));
      return () => cancelAnimationFrame(raf);
    }
    if (isVisible) {
      setIsActive(false);
      const timeout = window.setTimeout(() => setIsVisible(false), 280);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isOpen) return;
    if (categories.length) return;
    const load = async () => {
      const data = await fetchCategories();
      setCategories(data);
    };
    void load();
  }, [isOpen, categories.length]);

  if (!isVisible) return null;

  const effectiveSubtotal = items.reduce((sum, item) => {
    const basePrice = item.priceCents || 0;
    const isEligible = isPromotionEligible(promotion, item);
    const effectivePrice =
      isEligible && promotion ? getDiscountedCents(basePrice, promotion.percentOff) : basePrice;
    return sum + effectivePrice * (item.quantity || 1);
  }, 0);
  const shippingCents = calculateShippingCents(items, categories);
  const totalCents = effectiveSubtotal + shippingCents;
  const formatShipping = (cents: number) => (cents <= 0 ? 'FREE' : `$${(cents / 100).toFixed(2)}`);

  const handleCheckout = () => {
    if (!items.length) return;
    setCartDrawerOpen(false);
    const productId = items[0].productId;
    navigate(`/checkout?productId=${encodeURIComponent(productId)}`);
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-40 drawer-overlay motion-safe-only ${isActive ? 'is-open' : 'is-closed'}`}
        onClick={() => setCartDrawerOpen(false)}
      />
      <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-linen shadow-2xl z-50 flex flex-col drawer-panel motion-safe-only ${isActive ? 'is-open' : 'is-closed'}`}>
        <div className="p-5 border-b border-driftwood/70 flex items-center justify-between bg-white/90">
          <div>
            <p className="lux-eyebrow">Cart</p>
            <h2 className="text-xl font-serif text-deep-ocean">Your selection</h2>
          </div>
          <button
            onClick={() => setCartDrawerOpen(false)}
            className="lux-button--ghost px-3 py-2 rounded-full"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-charcoal/70">Your cart is empty</p>
            </div>
          ) : (
            items.map((item) => {
              const itemKey = `${item.productId}::${(item.optionValue || '').trim()}`;
              return (
              <div key={itemKey} className="flex gap-4 pb-4 border-b border-driftwood/50 last:border-b-0">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded-shell border border-driftwood/60 bg-white/80"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-serif font-semibold text-deep-ocean leading-snug">{item.name}</h3>
                  {item.optionGroupLabel && item.optionValue && (
                    <p className="text-xs text-charcoal/70 mt-1">
                      {item.optionGroupLabel}: {item.optionValue}
                    </p>
                  )}
                  <div className="text-sm text-charcoal/80 mt-1">
                    {isPromotionEligible(promotion, item) ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-charcoal/60 line-through">
                          ${(item.priceCents / 100).toFixed(2)}
                        </span>
                        <span className="text-sm text-deep-ocean">
                          ${(getDiscountedCents(item.priceCents, promotion?.percentOff || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span>${(item.priceCents / 100).toFixed(2)}</span>
                    )}
                  </div>
                  {item.oneoff ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="lux-pill--cart inline-flex">One-of-a-kind</span>
                      <button
                        onClick={() => removeItem(item.productId, item.optionValue)}
                        className="lux-button--ghost px-3 py-2 rounded-full text-red-700 border-red-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="lux-quantity">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1, item.optionValue)}
                          className="lux-button--ghost px-2 py-1 rounded-full"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-deep-ocean">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1, item.optionValue)}
                          disabled={item.quantityAvailable !== null && item.quantityAvailable !== undefined && item.quantity >= item.quantityAvailable}
                          className="lux-button--ghost px-2 py-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId, item.optionValue)}
                        className="ml-auto lux-button--ghost px-3 py-2 rounded-full text-red-700 border-red-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-driftwood/70 bg-white/90 space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-charcoal/80">
                <span>Subtotal</span>
                <span className="font-semibold text-deep-ocean">${(effectiveSubtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-charcoal/80">
                <span>Shipping</span>
                <span className="font-semibold text-deep-ocean">{formatShipping(shippingCents)}</span>
              </div>
              <div className="flex justify-between text-charcoal/70 text-xs">
                <span>Tax</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="lux-divider-soft" />
              <div className="flex justify-between text-base font-semibold text-deep-ocean">
                <span>Total</span>
                <span>${(totalCents / 100).toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="lux-button w-full justify-center"
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
