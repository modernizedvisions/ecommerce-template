import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingCart } from 'lucide-react';
import { fetchCategories, fetchProductById, fetchRelatedProducts } from '../lib/api';
import { Category, Product } from '../lib/types';
import { useCartStore } from '../store/cartStore';
import { useUIStore } from '../store/uiStore';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '@/lib/promotions';
import { buildCategoryOptionLookup, resolveCategoryOptionGroup } from '../lib/categoryOptions';

export function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const relatedRef = useRef<HTMLDivElement | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const isOneOffInCart = useCartStore((state) => state.isOneOffInCart);
  const qtyInCart = useCartStore((state) =>
    product ? state.getQuantityForProduct(product.id, selectedOption) : 0
  );
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const { promotion } = usePromotions();

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      setLoadingProduct(true);
      const found = await fetchProductById(productId);
      setProduct(found);
      setLoadingProduct(false);

      if (found) {
        setLoadingRelated(true);
        fetchRelatedProducts(found.type, found.id).then((items) => {
          setRelated(items);
          setLoadingRelated(false);
        });
      }
    };
    load();
  }, [productId]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await fetchCategories();
        setCategories(data);
      } catch (error) {
        console.error('Failed to load categories', error);
      }
    };
    void loadCategories();
  }, []);

  const images = useMemo(() => {
    if (!product) return [];
    if (product.imageUrls && product.imageUrls.length > 0) return product.imageUrls;
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product]);

  useEffect(() => {
    setCurrentIndex(0);
    setQuantity(1);
    setSelectedOption(null);
  }, [productId]);

  const handlePrev = () => {
    if (!images.length) return;
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (!images.length) return;
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const hasPrice = product?.priceCents !== undefined && product?.priceCents !== null;
  const isSold = product?.isSold || (product?.quantityAvailable !== undefined && (product.quantityAvailable ?? 0) <= 0);
  const canPurchase = !!product && hasPrice && !isSold;
  const optionLookup = useMemo(() => buildCategoryOptionLookup(categories), [categories]);
  const optionGroup = useMemo(() => {
    if (!product) return null;
    const categoryKey = product.category || product.type || '';
    return resolveCategoryOptionGroup(categoryKey, optionLookup);
  }, [product, optionLookup]);
  const requiresOption = !!optionGroup;
  const hasSelectedOption = !requiresOption || !!selectedOption;
  const promoEligible = product ? isPromotionEligible(promotion, product) : false;
  const discountedPriceCents =
    product?.priceCents !== undefined && product?.priceCents !== null && promoEligible && promotion
      ? getDiscountedCents(product.priceCents, promotion.percentOff)
      : product?.priceCents ?? null;
  const maxQty = product?.quantityAvailable ?? null;
  const maxSelectable =
    !product?.oneoff && maxQty !== null ? Math.max(0, maxQty - qtyInCart) : null;
  const showQuantitySelector =
    !!product && !product.oneoff && (maxQty === null || maxQty >= 1);
  const hasSelectableStock =
    !product?.oneoff && maxSelectable !== null ? maxSelectable > 0 : true;
  const effectiveQty = product?.oneoff
    ? 1
    : maxSelectable !== null
    ? Math.min(quantity, maxSelectable)
    : quantity;

  useEffect(() => {
    if (!product || product.oneoff) return;
    if (maxSelectable !== null && maxSelectable > 0) {
      setQuantity((prev) => Math.min(Math.max(prev, 1), maxSelectable));
    }
  }, [product?.id, product?.oneoff, maxSelectable]);

  const handleAddToCart = () => {
    if (!product || !hasPrice || isSold) return;
    if (product.oneoff && isOneOffInCart(product.id)) return;
    if (requiresOption && !selectedOption) return;
    if (!product.oneoff && !hasSelectableStock) return;
    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents ?? 0,
      quantity: effectiveQty,
      imageUrl: product.thumbnailUrl || product.imageUrl,
      oneoff: product.oneoff,
      quantityAvailable: product.quantityAvailable ?? null,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
      category: product.category ?? null,
      categories: product.categories ?? null,
      optionGroupLabel: optionGroup?.label ?? null,
      optionValue: selectedOption ?? null,
    });
    setCartDrawerOpen(true);
  };

  const formatPrice = (priceCents?: number | null) =>
    priceCents || priceCents === 0 ? `$${(priceCents / 100).toFixed(2)}` : '';

  if (!loadingProduct && !product) {
    return (
      <div className="py-16 bg-linen min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <h1 className="text-3xl font-serif text-deep-ocean">Product not found</h1>
          <Link to="/shop" className="lux-button--ghost inline-flex">
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-linen text-charcoal min-h-screen">
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 shell-pattern opacity-60" />
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(circle_at_top,_rgba(159,191,187,0.18),_transparent_55%)]" />

        <section className="pt-10 pb-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="lux-button--ghost px-4 py-2 uppercase tracking-[0.18em] text-[10px]"
              >
                Back
              </button>
              <span />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.05fr,0.95fr] gap-10 lg:gap-14 items-start">
              <div className="space-y-4">
                <div className="relative aspect-square rounded-shell-lg overflow-hidden bg-white/70 border border-driftwood/60 lux-shadow">
                  {loadingProduct ? (
                    <div className="w-full h-full animate-pulse bg-sand" />
                  ) : images.length ? (
                    <>
                      <img
                        src={images[currentIndex]}
                        alt={product?.name || 'Product'}
                        className="w-full h-full object-cover"
                        decoding="async"
                      />
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={handlePrev}
                            className="absolute left-3 top-1/2 -translate-y-1/2 lux-button--ghost px-3 py-2 rounded-full"
                            aria-label="Previous image"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleNext}
                            className="absolute right-3 top-1/2 -translate-y-1/2 lux-button--ghost px-3 py-2 rounded-full"
                            aria-label="Next image"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-charcoal/50">No image</div>
                  )}
                </div>

                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {images.map((url, idx) => (
                    <button
                      key={url}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-20 h-20 rounded-shell border ${idx === currentIndex ? 'border-deep-ocean shadow-md' : 'border-driftwood/60'} overflow-hidden bg-white/80 transition`}
                    >
                      <ProgressiveImage
                        src={url}
                        alt={`${product?.name}-thumb-${idx}`}
                        className="h-full w-full"
                        imgClassName="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5 bg-white/75 border border-driftwood/60 rounded-shell-lg p-6 sm:p-8 lux-shadow">
                <div className="space-y-3">
                  <p className="lux-eyebrow">{product?.category || product?.type || 'Product'}</p>
                  <h1 className="font-serif text-3xl sm:text-4xl leading-tight text-deep-ocean">
                    {loadingProduct ? 'Loading...' : product?.name}
                  </h1>
                  {product?.priceCents !== undefined && product?.priceCents !== null && (
                    <div className="text-[22px] font-serif font-semibold text-deep-ocean flex items-baseline gap-3">
                      {promoEligible && discountedPriceCents !== product.priceCents ? (
                        <>
                          <span className="text-sm text-charcoal/60 line-through">
                            {formatPrice(product.priceCents)}
                          </span>
                          <span className="text-[24px] text-deep-ocean">{formatPrice(discountedPriceCents)}</span>
                        </>
                      ) : (
                        <span>{formatPrice(product.priceCents)}</span>
                      )}
                    </div>
                  )}
                  <p className="text-base leading-relaxed text-charcoal/80">{product?.description}</p>
                </div>

                {optionGroup && (
                  <div className="lux-panel bg-linen/80 px-5 py-4 space-y-3">
                    <p className="lux-label text-[10px]">{optionGroup.label}</p>
                    <div className="space-y-2">
                      {optionGroup.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-3 text-sm text-charcoal/80">
                          <input
                            type="radio"
                            name="option-group"
                            value={opt}
                            checked={selectedOption === opt}
                            onChange={() => setSelectedOption(opt)}
                            className="h-4 w-4 rounded-full border-driftwood/70 text-deep-ocean"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                    {!selectedOption && (
                      <p className="text-xs text-rose-600">Please choose an option to continue.</p>
                    )}
                  </div>
                )}

                {showQuantitySelector && (
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="w-full">
                      <div className="lux-quantity w-full justify-between">
                        <button
                          onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                          disabled={quantity <= 1}
                          className="lux-button--ghost px-2 py-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-deep-ocean">{quantity}</span>
                        <button
                          onClick={() =>
                            setQuantity((prev) =>
                              maxSelectable !== null ? Math.min(prev + 1, Math.max(1, maxSelectable)) : prev + 1
                            )
                          }
                          disabled={maxSelectable !== null && quantity >= maxSelectable}
                          className="lux-button--ghost px-2 py-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-center">
                      <span className="text-[20px] font-serif font-semibold text-deep-ocean text-center">
                        {maxSelectable !== null ? `${maxSelectable} Left In Stock` : 'In Stock'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    onClick={handleAddToCart}
                    disabled={
                      !canPurchase ||
                      (product?.oneoff && isOneOffInCart(product.id)) ||
                      (!product?.oneoff && !hasSelectableStock) ||
                      !hasSelectedOption
                    }
                    className="lux-button w-full justify-center"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                  </button>
                  <Link
                    to="/custom-orders"
                    className="lux-button--ghost w-full justify-center"
                  >
                    Custom Request
                  </Link>
                </div>

                <div className="lux-panel bg-linen/80 px-5 py-4 space-y-2">
                  <h3 className="text-lg font-serif font-semibold text-deep-ocean">Designed with intention</h3>
                  <p className="text-sm leading-relaxed text-charcoal/80">
                    Each shell is hand-finished and composed to reflect coastal calm and personal meaning. Subtle variations in shape, tone, and edge are part of what makes every piece one of a kind.
                  </p>
                </div>

                <div className="lux-divider-soft" />
                <p className="text-xs uppercase tracking-[0.22em] text-deep-ocean/70 text-center">
                  Crafted to order - Carefully packaged - Ships from Boston
                </p>
              </div>
            </div>
          </div>
        </section>

        {!loadingRelated && related.length > 0 && (
          <section className="pb-14">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="lux-eyebrow">More from this collection</p>
                  <h2 className="lux-heading text-2xl sm:text-3xl">Curated for you</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => relatedRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
                    className="lux-button--ghost px-3 py-2 rounded-full"
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => relatedRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
                    className="lux-button--ghost px-3 py-2 rounded-full"
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div ref={relatedRef} className="flex gap-4 overflow-x-auto pb-2">
                {related.map((item) => (
                  <div
                    key={item.id}
                    className="w-64 flex-shrink-0 lux-card overflow-hidden bg-white/90"
                  >
                    <div className="aspect-square overflow-hidden rounded-shell-lg bg-sand">
                      <ProgressiveImage
                        src={item.imageUrl || item.imageUrls?.[0]}
                        alt={item.name}
                        className="h-full w-full"
                        imgClassName="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="text-lg font-serif font-semibold text-deep-ocean truncate">{item.name}</h3>
                      {item.priceCents !== undefined && item.priceCents !== null && (
                        <div className="text-sm font-semibold text-deep-ocean">
                          {isPromotionEligible(promotion, item) ? (
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs text-charcoal/60 line-through">
                                {formatPrice(item.priceCents)}
                              </span>
                              <span>{formatPrice(getDiscountedCents(item.priceCents, promotion?.percentOff || 0))}</span>
                            </div>
                          ) : (
                            <span>{formatPrice(item.priceCents)}</span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/product/${item.id}`)}
                          className="lux-button--ghost w-full justify-center"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            const relatedCategoryKey = item.category || item.type || '';
                            const relatedOptionGroup = resolveCategoryOptionGroup(relatedCategoryKey, optionLookup);
                            const relatedRequiresOption = !!relatedOptionGroup;
                            if (relatedRequiresOption) {
                              navigate(`/product/${item.id}`);
                              return;
                            }
                            if (!item.priceCents || item.isSold) return;
                            if (item.oneoff && isOneOffInCart(item.id)) return;
                            addItem({
                              productId: item.id,
                              name: item.name,
                              priceCents: item.priceCents,
                              quantity: 1,
                              imageUrl: item.thumbnailUrl || item.imageUrl,
                              oneoff: item.oneoff,
                              stripeProductId: item.stripeProductId ?? null,
                              stripePriceId: item.stripePriceId ?? null,
                            });
                            setCartDrawerOpen(true);
                          }}
                          disabled={
                            !item.priceCents ||
                            item.isSold ||
                            (item.oneoff && isOneOffInCart(item.id))
                          }
                          className="lux-button w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {canPurchase && (
        <div className="fixed md:hidden bottom-0 inset-x-0 z-40 px-3 pb-4">
          <div className="bg-white/95 border border-driftwood/70 rounded-shell-lg shadow-2xl p-3 flex items-center gap-3">
            {product?.priceCents !== undefined && product?.priceCents !== null && (
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.22em] text-charcoal/70">Total</p>
                <p className="text-lg font-serif font-semibold text-deep-ocean">
                  {promoEligible && discountedPriceCents !== product.priceCents
                    ? formatPrice(discountedPriceCents)
                    : formatPrice(product.priceCents)}
                </p>
              </div>
            )}
            <button
              onClick={handleAddToCart}
              disabled={
                !canPurchase ||
                (product?.oneoff && isOneOffInCart(product.id)) ||
                (!product?.oneoff && maxQty !== null && effectiveQty > maxQty) ||
                !hasSelectedOption
              }
              className="lux-button flex-1 justify-center"
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
