import React from 'react';
import type { Product } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';
import { ProgressiveImage } from '../ui/ProgressiveImage';
import { formatEasternDate } from '../../lib/dates';

export interface AdminSoldTabProps {
  soldProducts: Product[];
}

export function AdminSoldTab({ soldProducts }: AdminSoldTabProps) {
  return (
    <div className="lux-card p-6 space-y-4">
      <AdminSectionHeader
        title="Sold Products"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {soldProducts.length === 0 ? (
          <div className="col-span-full text-center text-charcoal/60 py-12">No sold products yet</div>
        ) : (
          soldProducts.map((product) => (
            <div key={product.id} className="lux-card overflow-hidden">
              <div className="aspect-square bg-linen/80">
                {product.imageUrl ? (
                  <ProgressiveImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full"
                    imgClassName="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/40">No Image</div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium text-charcoal mb-1">{product.name}</h3>
                <p className="text-sm text-charcoal/60">
                  {product.soldAt ? `Sold on ${formatEasternDate(product.soldAt)}` : 'Sold'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
