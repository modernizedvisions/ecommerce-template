import { ShoppingCart } from 'lucide-react';
import { Product } from '../lib/types';

interface HomeCategoryCardProps {
  product?: Product | null;
  label: string;
  ctaLabel: string;
  priceLabel: string;
  onView: () => void;
  onAddToCart?: () => void;
  onNavigate: () => void;
  isCartDisabled?: boolean;
  imageOverride?: string;
}

export default function HomeCategoryCard({
  product,
  label,
  ctaLabel,
  priceLabel,
  onView,
  onAddToCart,
  onNavigate,
  isCartDisabled = false,
  imageOverride,
}: HomeCategoryCardProps) {
  const imageSrc = imageOverride || product?.imageUrl;
  const title = product?.name || label;
  return (
    <div className="group bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100">
      <div className="aspect-square overflow-hidden bg-gray-100">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No image
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">{title}</h3>
            <p className="text-sm text-gray-600">{label}</p>
          </div>
          {priceLabel && product && <p className="text-lg font-bold text-gray-900 whitespace-nowrap">{priceLabel}</p>}
        </div>

        {product ? (
          <div className="flex gap-2">
            <button
              onClick={onView}
              className="flex-1 bg-gray-900 text-white py-2 px-3 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              View
            </button>
            <button
              onClick={onAddToCart}
              disabled={isCartDisabled}
              className="flex-1 flex items-center justify-center bg-white border border-gray-300 text-gray-700 py-2 px-3 rounded-md hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onNavigate}
              className="flex-1 bg-gray-900 text-white py-2 px-3 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              {ctaLabel}
            </button>
          </div>
        )}

        <button
          onClick={onNavigate}
          className="w-full mt-1 bg-gray-100 text-gray-900 py-2.5 px-4 rounded-md font-semibold hover:bg-gray-200 transition-colors animate-pulse"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
