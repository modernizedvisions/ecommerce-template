import React, { useRef, useState } from 'react';
import type { Category } from '../../lib/types';
import { Loader2, Trash2 } from 'lucide-react';
import { adminUploadImageScoped } from '../../lib/api';
import { ProgressiveImage } from '../ui/ProgressiveImage';

interface CategoryCardEditorProps {
  category: Category;
  onUpdate: (id: string, updates: Partial<Category>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  isBusy?: boolean;
}

const OTHER_ITEMS_CATEGORY = {
  slug: 'other-items',
  name: 'Other Items',
};

const isOtherItemsCategory = (category: Category) =>
  (category.slug || '').toLowerCase() === OTHER_ITEMS_CATEGORY.slug ||
  (category.name || '').trim().toLowerCase() === OTHER_ITEMS_CATEGORY.name.toLowerCase();

export function CategoryCardEditor({ category, onUpdate, onDelete, isBusy }: CategoryCardEditorProps) {
  const [name, setName] = useState(category.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) return;
    setIsSavingName(true);
    try {
      await onUpdate(category.id, { name: trimmed, slug: undefined });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleToggleHome = async () => {
    await onUpdate(category.id, { showOnHomePage: !category.showOnHomePage });
  };

  const handleDelete = async () => {
    if (isOtherItemsCategory(category)) return;
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;
    await onDelete(category.id);
  };

  const handleImageSelected = async (file: File) => {
    setIsUpdatingImage(true);
    try {
      const result = await adminUploadImageScoped(file, {
        scope: 'categories',
        onStatus: (status) => {
          setIsOptimizingImage(status === 'optimizing');
        },
      });
      await onUpdate(category.id, { imageUrl: result.url, imageId: result.imageId ?? undefined });
    } finally {
      setIsUpdatingImage(false);
      setIsOptimizingImage(false);
    }
  };

  return (
    <div className="lux-card overflow-hidden flex flex-col">
      <div className="relative aspect-[3/4] bg-linen/70">
        {category.imageUrl ? (
          <ProgressiveImage
            src={category.imageUrl}
            alt={category.name}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/50">No Image</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="pointer-events-auto lux-button--ghost px-4 py-1 text-[10px]"
            disabled={isBusy || isUpdatingImage}
          >
            {isOptimizingImage ? 'Optimizing...' : isUpdatingImage ? 'Saving...' : 'Edit Image'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageSelected(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <label className="lux-label text-[10px]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="lux-input text-sm mt-1"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveName}
            disabled={isBusy || isSavingName || name.trim() === category.name || !name.trim()}
            className="lux-button px-3 py-2 text-[10px] disabled:opacity-50"
          >
            {isSavingName ? 'Saving...' : 'Rename'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={!!category.showOnHomePage}
              onChange={handleToggleHome}
              disabled={isBusy}
              className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
            />
            Show on Home Page
          </label>

          {isOtherItemsCategory(category) ? (
            <span className="text-xs text-charcoal/60">Required</span>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isBusy}
              className="inline-flex items-center gap-1 text-sm text-rose-700 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="lux-card overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-linen/80" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-linen/80 rounded-shell w-2/3" />
        <div className="h-4 bg-linen/80 rounded-shell w-1/3" />
        <div className="h-8 bg-linen/80 rounded-shell w-full" />
      </div>
    </div>
  );
}
