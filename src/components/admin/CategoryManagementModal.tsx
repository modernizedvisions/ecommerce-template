import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminCreateCategory, adminDeleteCategory, adminFetchCategories, adminUpdateCategory } from '../../lib/api';
import type { Category } from '../../lib/types';

interface CategoryManagementModalProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoriesChange: (categories: Category[]) => void;
  onCategorySelected?: (name: string) => void;
}

const OTHER_ITEMS_CATEGORY = {
  slug: 'other-items',
  name: 'Other Items',
};

const isOtherItemsCategory = (category: Category) =>
  (category.slug || '').toLowerCase() === OTHER_ITEMS_CATEGORY.slug ||
  (category.name || '').trim().toLowerCase() === OTHER_ITEMS_CATEGORY.name.toLowerCase();

const normalizeCategoriesList = (items: Category[]): Category[] => {
  const map = new Map<string, Category>();
  const ordered: Category[] = [];
  items.forEach((cat) => {
    const key = cat.id || cat.name;
    if (!key || map.has(key)) return;
    const normalized: Category = { ...cat, id: cat.id || key };
    map.set(key, normalized);
    ordered.push(normalized);
  });
  return ordered;
};

const normalizeOptionList = (items: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  items.forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });
  return normalized;
};

const addOptionToList = (list: string[], raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return list;
  const key = trimmed.toLowerCase();
  if (list.some((item) => item.toLowerCase() === key)) return list;
  return [...list, trimmed];
};

export function CategoryManagementModal({
  open,
  onClose,
  categories,
  onCategoriesChange,
  onCategorySelected,
}: CategoryManagementModalProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySubtitle, setNewCategorySubtitle] = useState('');
  const [newCategoryShipping, setNewCategoryShipping] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionInput, setNewOptionInput] = useState('');
  const [newOptionList, setNewOptionList] = useState<string[]>([]);
  const [categoryMessage, setCategoryMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    subtitle: string;
    shipping: string;
    optionGroupLabel: string;
    optionGroupOptions: string[];
  } | null>(null);
  const [editOptionInput, setEditOptionInput] = useState('');
  const editTitleRef = useRef<HTMLInputElement | null>(null);
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const apiCategories = await adminFetchCategories();
        const normalized = normalizeCategoriesList(apiCategories);
        setAdminCategories(normalized);
        onCategoriesChange(normalized);
        setEditCategoryId(null);
        setEditDraft(null);
        setCategoryMessage('');
      } catch (error) {
        console.error('Failed to load categories', error);
        setCategoryMessage('Could not load categories.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setAdminCategories(normalizeCategoriesList(categories));
  }, [categories, open]);

  useEffect(() => {
    if (editCategoryId && editTitleRef.current) {
      editTitleRef.current.focus();
      editTitleRef.current.select();
    }
  }, [editCategoryId]);

  const sanitizeShippingInput = (value: string): string => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) return cleaned;
    const intPart = cleaned.slice(0, firstDot);
    const decPart = cleaned.slice(firstDot + 1).replace(/\./g, '');
    return `${intPart}.${decPart.slice(0, 2)}`;
  };

  const formatShippingDisplay = (value: string): string => {
    const sanitized = sanitizeShippingInput(value);
    if (!sanitized) return '';
    return `$${sanitized}`;
  };

  const formatShippingValue = (value: string): string => {
    const sanitized = sanitizeShippingInput(value);
    if (!sanitized) return '';
    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed) || parsed < 0) return '';
    return parsed.toFixed(2);
  };

  const normalizeShippingInput = (raw: string): number | null => {
    const sanitized = sanitizeShippingInput(raw);
    if (!sanitized) return 0;
    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100);
  };

  const handleSaveEdit = async (cat: Category) => {
    if (!editDraft) return;
    const trimmedName = editDraft.name.trim();
    if (!trimmedName) {
      setCategoryMessage('Title is required.');
      return;
    }
    const raw = editDraft.shipping;
    const normalized = normalizeShippingInput(raw);
    if (normalized === null) {
      setCategoryMessage('Shipping must be a non-negative number.');
      return;
    }
    try {
      const updated = await adminUpdateCategory(cat.id, {
        name: trimmedName,
        subtitle: editDraft.subtitle.trim() || undefined,
        shippingCents: normalized,
        optionGroupLabel: editDraft.optionGroupLabel.trim() || null,
        optionGroupOptions: normalizeOptionList(editDraft.optionGroupOptions),
      });
      if (updated) {
        const updatedList = normalizeCategoriesList(
          adminCategories.map((c) => (c.id === cat.id ? updated : c))
        );
        setAdminCategories(updatedList);
        onCategoriesChange(updatedList);
        setCategoryMessage('');
        setEditCategoryId(null);
        setEditDraft(null);
        setEditOptionInput('');
      }
    } catch (error) {
      console.error('Failed to update category', error);
      setCategoryMessage('Could not update category.');
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCategoryMessage('Title is required.');
      return;
    }
    const normalizedShipping = normalizeShippingInput(newCategoryShipping);
    if (normalizedShipping === null) {
      setCategoryMessage('Shipping must be a non-negative number.');
      return;
    }
    const maxSortOrder = adminCategories.reduce((max, cat) => Math.max(max, cat.sortOrder ?? 0), -1);
    const nextSortOrder = Math.max(0, maxSortOrder + 1);
    try {
      const created = await adminCreateCategory({
        name: trimmed,
        subtitle: newCategorySubtitle.trim() || undefined,
        shippingCents: normalizedShipping,
        sortOrder: nextSortOrder,
        optionGroupLabel: newOptionLabel.trim() || null,
        optionGroupOptions: normalizeOptionList(newOptionList),
      });
      if (created) {
        const updated = normalizeCategoriesList([...adminCategories, created]);
        setAdminCategories(updated);
        onCategoriesChange(updated);
        onCategorySelected?.(created.name);
        setNewCategoryName('');
        setNewCategorySubtitle('');
        setNewCategoryShipping('');
        setNewOptionLabel('');
        setNewOptionInput('');
        setNewOptionList([]);
        setCategoryMessage('');
      }
    } catch (error) {
      console.error('Failed to create category', error);
      setCategoryMessage('Could not create category.');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (isOtherItemsCategory(cat)) {
      setCategoryMessage('This category is required and cannot be deleted.');
      return;
    }
    const confirmed = window.confirm('Delete this category?');
    if (!confirmed) return;
    try {
      await adminDeleteCategory(cat.id);
      const updated = normalizeCategoriesList(adminCategories.filter((c) => c.id !== cat.id));
      setAdminCategories(updated);
      onCategoriesChange(updated);
      if (editCategoryId === cat.id) {
        setEditCategoryId(null);
        setEditDraft(null);
      }
    } catch (error) {
      console.error('Failed to delete category', error);
      setCategoryMessage('Could not delete category.');
    }
  };

  const handleMoveCategory = async (index: number, delta: number) => {
    if (isReordering) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= adminCategories.length) return;

    const previous = adminCategories;
    const swapped = [...adminCategories];
    [swapped[index], swapped[nextIndex]] = [swapped[nextIndex], swapped[index]];

    const changes = swapped
      .map((cat, idx) => ({ cat, newSortOrder: idx }))
      .filter(({ cat, newSortOrder }) => (cat.sortOrder ?? 0) !== newSortOrder);

    const reindexed = swapped.map((cat, idx) =>
      (cat.sortOrder ?? 0) === idx ? cat : { ...cat, sortOrder: idx }
    );

    setAdminCategories(reindexed);
    onCategoriesChange(reindexed);
    setIsReordering(true);
    try {
      for (const change of changes) {
        await adminUpdateCategory(change.cat.id, { sortOrder: change.newSortOrder });
      }
      setCategoryMessage('');
    } catch (error) {
      console.error('Failed to update category order', error);
      setAdminCategories(previous);
      onCategoriesChange(previous);
      setCategoryMessage('Could not update category order.');
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex w-full max-w-3xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 bg-white">
        {/* Keep header fixed and allow body to scroll within the modal. */}
        <div className="flex items-start justify-between gap-3 border-b border-driftwood/60 px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-center lux-heading text-lg">
              Category Management
            </DialogTitle>
            <p className="text-center text-sm text-charcoal/70">
              Add or delete categories available to products.
            </p>
          </DialogHeader>
          <button
            type="button"
            onClick={onClose}
            className="lux-button--ghost px-3 py-1 text-[10px]"
          >
            CLOSE
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-4">
          {categoryMessage && (
            <div className="rounded-shell border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {categoryMessage}
            </div>
          )}

          <div className="lux-panel p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-[1.3fr_1.3fr_0.9fr_160px] md:items-end">
              <div>
                <label className="lux-label text-[10px]">Title</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category title"
                  className="lux-input text-sm mt-1"
                />
              </div>
              <div>
                <label className="lux-label text-[10px]">Subtitle</label>
                <input
                  type="text"
                  value={newCategorySubtitle}
                  onChange={(e) => setNewCategorySubtitle(e.target.value)}
                  placeholder="Optional subtitle"
                  className="lux-input text-sm mt-1"
                />
              </div>
              <div>
                <label className="lux-label text-[10px]">Shipping</label>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="^\\$?\\d*(\\.\\d{0,2})?$"
                  value={formatShippingDisplay(newCategoryShipping)}
                  onChange={(e) => setNewCategoryShipping(sanitizeShippingInput(e.target.value))}
                  onBlur={(e) => setNewCategoryShipping(formatShippingValue(e.target.value))}
                  placeholder="$0.00"
                  className="lux-input text-sm mt-1"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
              >
                Add Category
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <div>
                <label className="lux-label text-[10px]">Variation Label</label>
                <input
                  type="text"
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  placeholder="Style"
                  className="lux-input text-sm mt-1"
                />
              </div>
              <div>
                <label className="lux-label text-[10px]">Variations</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={newOptionInput}
                    onChange={(e) => setNewOptionInput(e.target.value)}
                    placeholder="Plain Ring"
                    className="lux-input text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newOptionInput.trim()) return;
                      setNewOptionList((prev) => addOptionToList(prev, newOptionInput));
                      setNewOptionInput('');
                    }}
                    className="lux-button--ghost px-4 py-2 text-[10px] min-w-[96px]"
                  >
                    Add
                  </button>
                </div>
                {newOptionList.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {newOptionList.map((opt) => (
                      <span key={opt} className="inline-flex items-center gap-2 rounded-full border border-driftwood/60 bg-white/80 px-2 py-1 text-[11px]">
                        {opt}
                        <button
                          type="button"
                          onClick={() => setNewOptionList((prev) => prev.filter((item) => item !== opt))}
                          className="text-charcoal/60 hover:text-red-600"
                          aria-label={`Remove ${opt}`}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-charcoal/60">
              Customers choose one variation (e.g., Plain vs Woven). This appears on checkout and order emails.
            </p>
            <p className="text-xs text-charcoal/60">
              Shipping is a flat per-order fee; the lowest category shipping wins (0 makes shipping free).
            </p>
          </div>

          <div className="mt-4 border border-driftwood/60 rounded-shell-lg">
            <div className="max-h-72 overflow-y-auto divide-y divide-driftwood/60">
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-charcoal/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : adminCategories.length === 0 ? (
                <p className="px-3 py-2 text-sm text-charcoal/60">No categories yet.</p>
              ) : (
                adminCategories.map((cat, index) => (
                  <div key={cat.id} className="px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal truncate">
                          {cat.name || 'UNNAMED CATEGORY'}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-charcoal/50">
                          Order {index + 1}
                        </div>
                        {cat.subtitle && (
                          <div className="text-[10px] uppercase tracking-[0.18em] text-charcoal/60 truncate">
                            {cat.subtitle}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(index, -1)}
                            disabled={index === 0 || isReordering}
                            className="lux-button--ghost px-2 py-1 text-[10px] disabled:opacity-40"
                            aria-label={`Move ${cat.name} up`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(index, 1)}
                            disabled={index === adminCategories.length - 1 || isReordering}
                            className="lux-button--ghost px-2 py-1 text-[10px] disabled:opacity-40"
                            aria-label={`Move ${cat.name} down`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="lux-button--ghost px-3 py-1 text-[10px]"
                          onClick={() => {
                            if (editCategoryId === cat.id) {
                              setEditCategoryId(null);
                              setEditDraft(null);
                              setEditOptionInput('');
                              return;
                            }
                            const cents = typeof cat.shippingCents === 'number' ? cat.shippingCents : 0;
                            setEditCategoryId(cat.id);
                            setEditDraft({
                              name: cat.name || '',
                              subtitle: cat.subtitle || '',
                              shipping: cents > 0 ? (cents / 100).toFixed(2) : '',
                              optionGroupLabel: cat.optionGroupLabel || '',
                              optionGroupOptions: normalizeOptionList(cat.optionGroupOptions || []),
                            });
                            setEditOptionInput('');
                          }}
                        >
                          {editCategoryId === cat.id ? 'Close' : 'Edit'}
                        </button>
                        {isOtherItemsCategory(cat) ? (
                          <span className="text-[10px] uppercase tracking-[0.18em] text-charcoal/50">Required</span>
                        ) : (
                          <button
                            type="button"
                            className="text-charcoal/60 hover:text-red-600"
                            onClick={() => handleDeleteCategory(cat)}
                            aria-label={`Delete ${cat.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {editCategoryId === cat.id && editDraft && (
                      <div className="mt-3 lux-panel p-3 space-y-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <label className="lux-label text-[10px]">
                              Title
                            </label>
                            <input
                              ref={editTitleRef}
                              type="text"
                              value={editDraft.name}
                              onChange={(e) =>
                                setEditDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                              }
                              className="lux-input text-sm mt-1"
                            />
                          </div>
                          <div>
                            <label className="lux-label text-[10px]">
                              Subtitle
                            </label>
                            <input
                              type="text"
                              value={editDraft.subtitle}
                              onChange={(e) =>
                                setEditDraft((prev) => (prev ? { ...prev, subtitle: e.target.value } : prev))
                              }
                              className="lux-input text-sm mt-1"
                            />
                          </div>
                          <div>
                            <label className="lux-label text-[10px]">
                              Shipping
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              pattern="^\\$?\\d*(\\.\\d{0,2})?$"
                              value={formatShippingDisplay(editDraft.shipping)}
                              onChange={(e) => {
                                const next = sanitizeShippingInput(e.target.value);
                                setEditDraft((prev) => (prev ? { ...prev, shipping: next } : prev));
                              }}
                              onBlur={(e) => {
                                const formatted = formatShippingValue(e.target.value);
                                setEditDraft((prev) => (prev ? { ...prev, shipping: formatted } : prev));
                              }}
                              placeholder="$0.00"
                              className="lux-input text-sm mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                          <div>
                            <label className="lux-label text-[10px]">
                              Variation Label
                            </label>
                            <input
                              type="text"
                              value={editDraft.optionGroupLabel}
                              onChange={(e) =>
                                setEditDraft((prev) => (prev ? { ...prev, optionGroupLabel: e.target.value } : prev))
                              }
                              placeholder="Style"
                              className="lux-input text-sm mt-1"
                            />
                          </div>
                          <div>
                            <label className="lux-label text-[10px]">Variations</label>
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                value={editOptionInput}
                                onChange={(e) => setEditOptionInput(e.target.value)}
                                placeholder="Plain Ring"
                                className="lux-input text-sm flex-1"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!editOptionInput.trim()) return;
                                  setEditDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          optionGroupOptions: addOptionToList(prev.optionGroupOptions, editOptionInput),
                                        }
                                      : prev
                                  );
                                  setEditOptionInput('');
                                }}
                                className="lux-button--ghost px-3 py-2 text-[10px]"
                              >
                                Add
                              </button>
                            </div>
                            {editDraft.optionGroupOptions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {editDraft.optionGroupOptions.map((opt) => (
                                  <span key={opt} className="inline-flex items-center gap-2 rounded-full border border-driftwood/60 bg-white/80 px-2 py-1 text-[11px]">
                                    {opt}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                optionGroupOptions: prev.optionGroupOptions.filter((item) => item !== opt),
                                              }
                                            : prev
                                        )
                                      }
                                      className="text-charcoal/60 hover:text-red-600"
                                      aria-label={`Remove ${opt}`}
                                    >
                                      x
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-charcoal/60">
                          Customers choose one variation (e.g., Plain vs Woven). This appears on checkout and order emails.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditCategoryId(null);
                              setEditDraft(null);
                              setEditOptionInput('');
                            }}
                            className="lux-button--ghost px-4 py-2 text-[10px]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(cat)}
                            className="lux-button px-4 py-2 text-[10px]"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
