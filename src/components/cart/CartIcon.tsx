import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUIStore } from '../../store/uiStore';

export function CartIcon() {
  const totalItems = useCartStore((state) => state.getTotalItems());
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);

  return (
    <button
      onClick={() => setCartDrawerOpen(true)}
      className="relative p-2 hover:bg-gray-100 rounded-full rounded-ui transition-colors"
      aria-label="Shopping cart"
    >
      <ShoppingCart className="w-6 h-6 text-gray-700" />
      {totalItems > 0 && (
        <span className="absolute -top-1 -right-1 text-xs font-serif font-semibold text-slate-900 leading-none">
          {totalItems}
        </span>
      )}
    </button>
  );
}
