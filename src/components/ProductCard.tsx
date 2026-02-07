import { ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '../lib/types';
import type { CategoryOptionGroup } from '../lib/categoryOptions';
import { resolveCategoryOptionGroup } from '../lib/categoryOptions';
import { useCartStore } from '../store/cartStore';
import { useUIStore } from '../store/uiStore';
import { ProgressiveImage } from './ui/ProgressiveImage';
import { buildOptimizedImageSrc } from '../lib/imageOptimize';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '../lib/promotions';

interface ProductCardProps {
  product: Product;
  categoryOptionLookup?: Map<string, CategoryOptionGroup>;
}

export function ProductCard({ product, categoryOptionLookup }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const qtyInCart = useCartStore((state) => {
    const found = state.items.find((i) => i.productId === product.id);
    return found?.quantity ?? 0;
  });
  const isOneOffInCart = useCartStore((state) => state.isOneOffInCart);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const navigate = useNavigate();
  const { promotion } = usePromotions();

  const inCart = qtyInCart > 0;
  const maxQty = product.quantityAvailable ?? null;
  const isAtMax = maxQty !== null && qtyInCart >= maxQty;
  const isDisabled = (product.oneoff && inCart) || (maxQty !== null && qtyInCart >= maxQty);
  const isSold = product.isSold || (product.quantityAvailable !== undefined && product.quantityAvailable <= 0);
  const isPurchaseReady = !!product.priceCents && !isSold;
  const rawSrc = product.imageUrl || product.imageUrls?.[0] || '';
  const { primarySrc, fallbackSrc } = buildOptimizedImageSrc(rawSrc, 'thumb');

  const handleAddToCart = () => {
    if (!product.priceCents || isSold) return;
    if (product.oneoff && isOneOffInCart(product.id)) return;
    if (maxQty !== null && qtyInCart >= maxQty) {
      if (typeof window !== 'undefined') {
        alert(`Only ${maxQty} available.`);
      }
      return;
    }

    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      quantity: 1,
      imageUrl: product.thumbnailUrl || product.imageUrl,
      oneoff: product.oneoff,
      quantityAvailable: product.quantityAvailable ?? null,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
      category: product.category ?? null,
      categories: product.categories ?? null,
    });
    setCartDrawerOpen(true);
  };

  const basePriceCents = product.priceCents ?? null;
  const promoEligible = isPromotionEligible(promotion, product);
  const discountedCents =
    basePriceCents !== null && promoEligible && promotion
      ? getDiscountedCents(basePriceCents, promotion.percentOff)
      : basePriceCents;
  const priceLabel = basePriceCents !== null ? `$${(basePriceCents / 100).toFixed(2)}` : '';
  const discountedLabel =
    discountedCents !== null ? `$${(discountedCents / 100).toFixed(2)}` : '';

  const productHref = `/product/${product.id}`;
  const categoryKey = product.category || product.type || '';
  const optionGroup = categoryOptionLookup ? resolveCategoryOptionGroup(categoryKey, categoryOptionLookup) : null;
  const requiresOption = !!optionGroup;

  return (
    <div className="group lux-card bg-white/90 overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
      <div className="relative aspect-square overflow-hidden rounded-shell-lg bg-sand">
        {inCart && (
          <span className="absolute top-3 right-3 z-10 lux-pill--cart">In Your Cart</span>
        )}
        <Link
          to={productHref}
          aria-label={`View ${product.name}`}
          className="block h-full w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-deep-ocean focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          {rawSrc ? (
            <ProgressiveImage
              src={primarySrc}
              fallbackSrc={fallbackSrc}
              timeoutMs={2500}
              alt={product.name}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-charcoal/50">
              No image
            </div>
          )}
        </Link>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
          <h3 className="text-base font-serif font-semibold text-deep-ocean truncate sm:whitespace-normal sm:overflow-visible sm:text-ellipsis">
            {product.name}
          </h3>
          {promoEligible && discountedCents !== basePriceCents && basePriceCents !== null ? (
            <div className="sm:text-right whitespace-nowrap">
              <div className="text-xs text-charcoal/60 line-through">{priceLabel}</div>
              <div className="text-lg font-serif font-semibold text-deep-ocean">{discountedLabel}</div>
            </div>
          ) : (
            <span className="text-lg font-serif font-semibold text-deep-ocean whitespace-nowrap">{priceLabel}</span>
          )}
        </div>

        {isSold && (
          <div className="mb-1">
            <span className="lux-pill bg-red-50 text-red-700 border-red-200">
              Sold
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <button
            onClick={() => navigate(productHref)}
            className="lux-button--ghost w-full justify-center flex-1 min-w-0 px-3 sm:px-5"
          >
            View
          </button>
          <button
            onClick={() => {
              if (requiresOption) {
                navigate(productHref);
                return;
              }
              handleAddToCart();
            }}
            disabled={!requiresOption && (isDisabled || !isPurchaseReady)}
            className="lux-button w-full justify-center flex-1 min-w-0 px-3 sm:px-5 border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={requiresOption ? 'Choose options' : 'Add to Cart'}
          >
            {requiresOption ? (
              <>
                <span className="hidden sm:inline">Choose</span>
                <ShoppingCart className="h-5 w-5 sm:hidden" />
              </>
            ) : (
              <ShoppingCart className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
