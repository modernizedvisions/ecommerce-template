import { Product } from '../lib/types';
import type { CategoryOptionGroup } from '../lib/categoryOptions';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  categoryOptionLookup?: Map<string, CategoryOptionGroup>;
}

export function ProductGrid({ products, categoryOptionLookup }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No products found</p>
      </div>
    );
  }

  return (
    <div className="product-grid grid gap-6 grid-cols-2 landscape:grid-cols-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} categoryOptionLookup={categoryOptionLookup} />
      ))}
    </div>
  );
}
