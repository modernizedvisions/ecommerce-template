import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  fetchShopCategoryTiles,
  saveShopCategoryTiles,
  adminUpdateCategory,
  adminUploadImageScoped,
  getAdminSiteContentHome,
  updateAdminSiteContentHome,
} from '../../lib/api';
import type { Category, HomeSiteContent, ShopCategoryTile } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';
import { AdminSaveButton, type AdminSaveState } from './AdminSaveButton';
import { ProgressiveImage } from '../ui/ProgressiveImage';

interface ShopCategoryCardsSectionProps {
  categories?: Category[];
  onCategoryUpdated?: (category: Category) => void;
}

const SLOT_COUNT = 4;

export function ShopCategoryCardsSection({ categories = [], onCategoryUpdated }: ShopCategoryCardsSectionProps) {
  const [tiles, setTiles] = useState<ShopCategoryTile[]>([]);
  const [saveState, setSaveState] = useState<AdminSaveState>('idle');
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [categoryState, setCategoryState] = useState<Category[]>(categories);
  const [tileStatus, setTileStatus] = useState<Record<string, 'optimizing' | 'uploading' | null>>({});
  const [homeContent, setHomeContent] = useState<HomeSiteContent>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadTiles();
  }, []);

  useEffect(() => {
    setCategoryState(categories);
  }, [categories]);

  // Ensure each tile is hydrated with a categoryId when a matching slug exists.
  useEffect(() => {
    if (!tiles.length || !categoryState.length) return;

    let changed = false;
    const hydrated = tiles.map((tile) => {
      if (tile.categoryId) return tile;
      const match = findCategoryBySlug(categoryState, tile.categorySlug);
      if (!match) return tile;
      changed = true;
      return {
        ...tile,
        categoryId: match.id,
        label: match.name || tile.label,
        ctaLabel: match.name ? `All ${match.name}` : tile.ctaLabel,
      };
    });

    if (changed) {
      setTiles(hydrated);
    }
  }, [tiles, categoryState]);

  const loadTiles = async () => {
    try {
      const content = await getAdminSiteContentHome();
      setHomeContent(content || {});
      const fromContent = buildTilesFromHomeContent(content);
      if (fromContent.length) {
        setTiles(fromContent);
        return;
      }
    } catch (error) {
      console.error('Failed to load site content category tiles', error);
    }
    try {
      const loaded = await fetchShopCategoryTiles();
      const normalized = normalizeToFour(loaded).map((tile, index) => ({
        ...tile,
        slotIndex: tile.slotIndex ?? index,
      }));
      setTiles(normalized.slice(0, SLOT_COUNT));
    } catch (error) {
      console.error('Failed to load category tiles', error);
    }
  };

  const resolveCategoryForTile = (tile: ShopCategoryTile) => {
    if (!tile) return undefined;
    return (
      categoryOptions.find((c) => c.id === tile.categoryId) ||
      findCategoryBySlug(categoryOptions, tile.categorySlug)
    );
  };

  const handleTileImageSelect = (file: File, tileId: string) => {
    const tile = tiles.find((t) => t.id === tileId);
    const resolvedCategory = tile ? resolveCategoryForTile(tile) : undefined;
    const categoryId = resolvedCategory?.id;
    if (!categoryId) {
      alert('Please select a category before uploading an image.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const previous = resolvedCategory?.heroImageUrl || resolvedCategory?.imageUrl || '';
    // Optimistically update local category hero image
    setCategoryState((prev) =>
      prev.map((cat) => (cat.id === categoryId ? { ...cat, heroImageUrl: previewUrl } : cat))
    );

    const runUpload = async () => {
      try {
        setTileStatus((prev) => ({ ...prev, [tileId]: 'optimizing' }));
        const result = await adminUploadImageScoped(file, {
          scope: 'categories',
          onStatus: (status) => {
            setTileStatus((prev) => ({ ...prev, [tileId]: status }));
          },
        });
        URL.revokeObjectURL(previewUrl);
        const updated = await adminUpdateCategory(categoryId, {
          heroImageUrl: result.url,
          heroImageId: result.imageId ?? undefined,
        });
        if (updated) {
          setCategoryState((prev) => prev.map((cat) => (cat.id === updated.id ? { ...cat, ...updated } : cat)));
          onCategoryUpdated?.(updated);
        }
      } catch (err) {
        console.error('Failed to update category hero image', err);
        setCategoryState((prev) =>
          prev.map((cat) => (cat.id === categoryId ? { ...cat, heroImageUrl: previous } : cat))
        );
        alert('Failed to save image. Please try again.');
      } finally {
        setTileStatus((prev) => ({ ...prev, [tileId]: null }));
      }
    };
    void runUpload();
  };

  const handleSave = async () => {
    setSaveState('saving');
    try {
      const withSlots = tiles.map((tile, index) => {
        const category = categoryOptions.find((c) => c.id === tile.categoryId);
        return {
          ...tile,
          slotIndex: tile.slotIndex ?? index,
          imageUrl: category?.heroImageUrl || category?.imageUrl || tile.imageUrl || '',
        };
      });
      const shopCategoryCards = withSlots.map((tile, index) => ({
        slotIndex: tile.slotIndex ?? index,
        categoryId: tile.categoryId,
        categorySlug: tile.categorySlug,
        label: tile.label,
        ctaLabel: tile.ctaLabel,
      }));
      const merged: HomeSiteContent = { ...homeContent, shopCategoryCards };
      await updateAdminSiteContentHome(merged);
      setHomeContent(merged);
      await saveShopCategoryTiles(withSlots);
      setTiles(withSlots.slice(0, SLOT_COUNT));
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      console.error('Failed to save category tiles', err);
      setSaveState('error');
    }
  };

  const categoryOptions = useMemo(() => categoryState, [categoryState]);

  const handleCategoryChange = (tileId: string, categoryId: string) => {
    const selected = categoryOptions.find((c) => c.id === categoryId);
    if (!selected) return;
    setTiles((prev) =>
      prev.map((tile) =>
        tile.id === tileId
          ? {
              ...tile,
              categoryId,
              label: selected.name,
              ctaLabel: selected.name ? `All ${selected.name}` : tile.ctaLabel,
              categorySlug: selected.slug || tile.categorySlug,
            }
          : tile
      )
    );
  };

  return (
    <div className="lux-card p-4 space-y-4">
      <div className="relative pb-1">
        <AdminSectionHeader
          title="Category Cards"
          subtitle="choose which categories appear on the homepage."
          className="text-center"
        />
        <div className="absolute right-0 top-0 flex justify-end">
          <AdminSaveButton
            saveState={saveState}
            onClick={handleSave}
            idleLabel="Save Category Cards"
          />
        </div>
        <div className="mt-2 text-xs text-charcoal/60">
          {saveState === 'saving' && 'Saving changes...'}
          {saveState === 'success' && 'Category cards saved.'}
          {saveState === 'error' && 'Save failed. Please retry.'}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.slice(0, SLOT_COUNT).map((tile, idx) => {
          const selectedCategory = resolveCategoryForTile(tile);
          const displayLabel = (selectedCategory?.name || tile.label || `Category ${idx + 1}`).toUpperCase();
          const pillText = `SHOP ${displayLabel}`;
          const categoryImage = selectedCategory?.heroImageUrl || selectedCategory?.imageUrl;
          const status = tileStatus[tile.id];
          const inputId = `category-tile-${tile.id || idx}`;

          return (
            <div
              key={tile.id || idx}
              className="space-y-3 lux-panel p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  setActiveTileId(tile.id);
                  handleTileImageSelect(file, tile.id);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <label className="sr-only" htmlFor={inputId}>
                    Category
                  </label>
                  <select
                    id={inputId}
                    aria-label="Select category"
                    value={selectedCategory?.id || ''}
                    onChange={(e) => handleCategoryChange(tile.id, e.target.value)}
                    className="lux-input text-[11px] uppercase tracking-[0.22em] font-semibold"
                  >
                    <option value="">SELECT CATEGORY</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {(cat.name || '').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTileId(tile.id);
                      fileInputRef.current?.click();
                    }}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    Upload
                  </button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-shell-lg border border-driftwood/60 bg-linen/80 aspect-[3/4]">
                {categoryImage ? (
                  <ProgressiveImage
                    src={categoryImage}
                    alt={displayLabel}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/60">
                    No Image Uploaded
                  </div>
                )}

                {status && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80/70 text-xs text-charcoal/70">
                    {status === 'optimizing' ? 'Optimizing image...' : 'Uploading...'}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
                <div className="absolute inset-x-0 bottom-4 flex justify-center">
                  <span className="pointer-events-auto lux-pill px-5 py-2 text-[10px]">
                    {pillText}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeTileId) {
            handleTileImageSelect(file, activeTileId);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
}

const normalizeToFour = (tiles: ShopCategoryTile[]): ShopCategoryTile[] => {
  const result = [...tiles];
  const defaults = [
    {
      id: 'slot-1',
      label: 'Ring Dishes',
      ctaLabel: 'All Ring Dishes',
      categorySlug: 'ring-dish',
      imageUrl: '',
      slotIndex: 0,
    },
    {
      id: 'slot-2',
      label: 'Ornaments',
      ctaLabel: 'All Ornaments',
      categorySlug: 'ornament',
      imageUrl: '',
      slotIndex: 1,
    },
    {
      id: 'slot-3',
      label: 'Decor',
      ctaLabel: 'All Decor',
      categorySlug: 'decor',
      imageUrl: '',
      slotIndex: 2,
    },
    {
      id: 'slot-4',
      label: 'Wine Stoppers',
      ctaLabel: 'All Wine Stoppers',
      categorySlug: 'wine-stopper',
      imageUrl: '',
      slotIndex: 3,
    },
  ];
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (!result[i]) result[i] = defaults[i] as ShopCategoryTile;
  }
  return result.slice(0, SLOT_COUNT);
};

const buildTilesFromHomeContent = (content?: HomeSiteContent | null): ShopCategoryTile[] => {
  const slots = content?.shopCategoryCards;
  if (!Array.isArray(slots) || !slots.length) return [];
  const mapped = slots.map((slot, index) => ({
    id: slot.categoryId || slot.categorySlug || `slot-${index + 1}`,
    label: slot.label || '',
    ctaLabel: slot.ctaLabel || '',
    categorySlug: slot.categorySlug || '',
    imageUrl: '',
    slotIndex: typeof slot.slotIndex === 'number' ? slot.slotIndex : index,
    categoryId: slot.categoryId,
  }));
  const ordered = mapped.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  return normalizeToFour(ordered).map((tile, index) => ({
    ...tile,
    slotIndex: tile.slotIndex ?? index,
  }));
};

const findCategoryBySlug = (categories: Category[], slug?: string) => {
  if (!slug) return undefined;
  return categories.find((c) => (c.slug || '').toLowerCase() === slug.toLowerCase());
};
