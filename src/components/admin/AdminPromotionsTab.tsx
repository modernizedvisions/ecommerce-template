import { useEffect, useMemo, useState } from 'react';
import { AdminSectionHeader } from './AdminSectionHeader';
import {
  createAdminPromotion,
  deleteAdminPromotion,
  adminFetchCategories,
  fetchAdminPromoCodes,
  fetchAdminPromotions,
  updateAdminPromotion,
  updateAdminPromoCode,
  createAdminPromoCode,
  deleteAdminPromoCode,
} from '../../lib/api';
import type { Category, PromoCode, Promotion } from '../../lib/types';
import { formatEasternDateTime, toEasternDateTimeLocal, fromEasternDateTimeLocal } from '../../lib/dates';

type PromotionFormState = {
  name: string;
  percentOff: string;
  scope: 'global' | 'categories';
  categorySlugs: string[];
  bannerEnabled: boolean;
  bannerText: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

type PromoCodeFormState = {
  code: string;
  percentOff: string;
  freeShipping: boolean;
  scope: 'global' | 'categories';
  categorySlugs: string[];
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

const emptyPromotionForm: PromotionFormState = {
  name: '',
  percentOff: '',
  scope: 'global',
  categorySlugs: [],
  bannerEnabled: false,
  bannerText: '',
  startsAt: '',
  endsAt: '',
  enabled: false,
};

const emptyPromoCodeForm: PromoCodeFormState = {
  code: '',
  percentOff: '',
  freeShipping: false,
  scope: 'global',
  categorySlugs: [],
  startsAt: '',
  endsAt: '',
  enabled: false,
};

const formatRange = (startsAt?: string | null, endsAt?: string | null) => {
  const start = startsAt ? formatEasternDateTime(startsAt) : 'Anytime';
  const end = endsAt ? formatEasternDateTime(endsAt) : 'Anytime';
  return `${start} - ${end}`;
};

export function AdminPromotionsTab() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promotionForm, setPromotionForm] = useState<PromotionFormState>(emptyPromotionForm);
  const [promoCodeForm, setPromoCodeForm] = useState<PromoCodeFormState>(emptyPromoCodeForm);
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [editingPromoCodeId, setEditingPromoCodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [promos, codes, cats] = await Promise.all([
          fetchAdminPromotions(),
          fetchAdminPromoCodes(),
          adminFetchCategories(),
        ]);
        setPromotions(promos);
        setPromoCodes(codes);
        setCategories(cats);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load promotions data.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePromotionFormChange = (
    field: keyof PromotionFormState,
    value: string | boolean | string[]
  ) => {
    setPromotionForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePromoCodeFormChange = (
    field: keyof PromoCodeFormState,
    value: string | boolean | string[]
  ) => {
    setPromoCodeForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetPromotionForm = () => {
    setPromotionForm(emptyPromotionForm);
    setEditingPromotionId(null);
  };

  const resetPromoCodeForm = () => {
    setPromoCodeForm(emptyPromoCodeForm);
    setEditingPromoCodeId(null);
  };

  const startEditPromotion = (promo: Promotion) => {
    setPromotionForm({
      name: promo.name,
      percentOff: promo.percentOff ? String(promo.percentOff) : '',
      scope: promo.scope,
      categorySlugs: promo.categorySlugs || [],
      bannerEnabled: promo.bannerEnabled,
      bannerText: promo.bannerText || '',
      startsAt: toEasternDateTimeLocal(promo.startsAt),
      endsAt: toEasternDateTimeLocal(promo.endsAt),
      enabled: promo.enabled,
    });
    setEditingPromotionId(promo.id);
  };

  const startEditPromoCode = (code: PromoCode) => {
    setPromoCodeForm({
      code: code.code,
      percentOff: code.percentOff ? String(code.percentOff) : '',
      freeShipping: code.freeShipping,
      scope: code.scope,
      categorySlugs: code.categorySlugs || [],
      startsAt: toEasternDateTimeLocal(code.startsAt),
      endsAt: toEasternDateTimeLocal(code.endsAt),
      enabled: code.enabled,
    });
    setEditingPromoCodeId(code.id);
  };

  const submitPromotion = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: promotionForm.name.trim(),
        percentOff: Number(promotionForm.percentOff),
        scope: promotionForm.scope,
        categorySlugs: promotionForm.scope === 'categories' ? promotionForm.categorySlugs : [],
        bannerEnabled: promotionForm.bannerEnabled,
        bannerText: promotionForm.bannerText.trim(),
        startsAt: fromEasternDateTimeLocal(promotionForm.startsAt),
        endsAt: fromEasternDateTimeLocal(promotionForm.endsAt),
        enabled: promotionForm.enabled,
      };

      if (editingPromotionId) {
        const updated = await updateAdminPromotion(editingPromotionId, payload);
        setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createAdminPromotion(payload);
        setPromotions((prev) => [created, ...prev]);
      }
      resetPromotionForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promotion.');
    } finally {
      setSaving(false);
    }
  };

  const submitPromoCode = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: promoCodeForm.code.trim(),
        percentOff: promoCodeForm.percentOff ? Number(promoCodeForm.percentOff) : null,
        freeShipping: promoCodeForm.freeShipping,
        scope: promoCodeForm.scope,
        categorySlugs: promoCodeForm.scope === 'categories' ? promoCodeForm.categorySlugs : [],
        startsAt: fromEasternDateTimeLocal(promoCodeForm.startsAt),
        endsAt: fromEasternDateTimeLocal(promoCodeForm.endsAt),
        enabled: promoCodeForm.enabled,
      };

      if (editingPromoCodeId) {
        const updated = await updateAdminPromoCode(editingPromoCodeId, payload);
        setPromoCodes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createAdminPromoCode(payload);
        setPromoCodes((prev) => [created, ...prev]);
      }
      resetPromoCodeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promo code.');
    } finally {
      setSaving(false);
    }
  };

  const togglePromotionEnabled = async (promo: Promotion) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdminPromotion(promo.id, { enabled: !promo.enabled });
      setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update promotion.');
    } finally {
      setSaving(false);
    }
  };

  const togglePromoCodeEnabled = async (code: PromoCode) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdminPromoCode(code.id, { enabled: !code.enabled });
      setPromoCodes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update promo code.');
    } finally {
      setSaving(false);
    }
  };

  const removePromotion = async (promo: Promotion) => {
    setSaving(true);
    setError(null);
    try {
      await deleteAdminPromotion(promo.id);
      setPromotions((prev) => prev.filter((p) => p.id !== promo.id));
      if (editingPromotionId === promo.id) resetPromotionForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promotion.');
    } finally {
      setSaving(false);
    }
  };

  const removePromoCode = async (code: PromoCode) => {
    setSaving(true);
    setError(null);
    try {
      await deleteAdminPromoCode(code.id);
      setPromoCodes((prev) => prev.filter((c) => c.id !== code.id));
      if (editingPromoCodeId === code.id) resetPromoCodeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promo code.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-charcoal/70">Loading promotions...</div>;
  }

  return (
    <div className="lux-card overflow-hidden">
      <div className="px-6 pt-6">
        <AdminSectionHeader title="Promotions" subtitle="Manage promotions and promo codes." />
      </div>
      <div className="px-6 pb-10 space-y-12">
        {error && (
          <div className="rounded-shell border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="space-y-6">
          <div>
            <h3 className="lux-heading text-lg">Promotions</h3>
            <p className="text-sm text-charcoal/70">
              Only one promotion can be enabled at a time.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lux-panel p-4 space-y-4">
              <div className="text-sm font-semibold text-charcoal">
                {editingPromotionId ? 'Edit Promotion' : 'Create Promotion'}
              </div>
              <div className="space-y-3">
                <label className="block lux-label text-[10px]">Name</label>
                <input
                  type="text"
                  value={promotionForm.name}
                  onChange={(e) => handlePromotionFormChange('name', e.target.value)}
                  placeholder="Summer Sale"
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Percent off</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={promotionForm.percentOff}
                  onChange={(e) => handlePromotionFormChange('percentOff', e.target.value)}
                  placeholder="10%"
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Scope</label>
                <select
                  value={promotionForm.scope}
                  onChange={(e) => handlePromotionFormChange('scope', e.target.value)}
                  className="lux-input text-[11px] uppercase tracking-[0.22em] font-semibold"
                >
                  <option value="global">GLOBAL</option>
                  <option value="categories">CATEGORIES</option>
                </select>
                {promotionForm.scope === 'categories' && (
                  <div className="space-y-2">
                    <div className="lux-label text-[10px]">Categories</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {categoryOptions.map((category) => {
                        const checked = promotionForm.categorySlugs.includes(category.slug);
                        return (
                          <label key={category.slug} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...promotionForm.categorySlugs, category.slug]
                                  : promotionForm.categorySlugs.filter((slug) => slug !== category.slug);
                                handlePromotionFormChange('categorySlugs', next);
                              }}
                              className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                            />
                            <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
                              {category.name?.toUpperCase() || 'CATEGORY'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={promotionForm.bannerEnabled}
                    onChange={(e) => handlePromotionFormChange('bannerEnabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal/80">Show banner</span>
                </div>
                {promotionForm.bannerEnabled && (
                  <input
                    type="text"
                    value={promotionForm.bannerText}
                    onChange={(e) => handlePromotionFormChange('bannerText', e.target.value)}
                    placeholder="Banner text"
                    className="lux-input text-sm"
                  />
                )}
                <label className="block lux-label text-[10px]">Starts at</label>
                <input
                  type="datetime-local"
                  value={promotionForm.startsAt}
                  onChange={(e) => handlePromotionFormChange('startsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Ends at</label>
                <input
                  type="datetime-local"
                  value={promotionForm.endsAt}
                  onChange={(e) => handlePromotionFormChange('endsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={promotionForm.enabled}
                    onChange={(e) => handlePromotionFormChange('enabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Enabled
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitPromotion}
                  disabled={saving}
                  className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
                >
                  {editingPromotionId ? 'Update' : 'Create'}
                </button>
                {editingPromotionId && (
                  <button
                    type="button"
                    onClick={resetPromotionForm}
                    className="lux-button--ghost px-4 py-2 text-[10px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {promotions.length === 0 ? (
                <div className="lux-panel p-4 text-sm text-charcoal/70">
                  No promotions yet.
                </div>
              ) : (
                promotions.map((promo) => (
                  <div key={promo.id} className="lux-panel p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-charcoal">{promo.name}</div>
                        <div className="text-xs text-charcoal/60">{promo.percentOff}% off</div>
                      </div>
                      <span className={`text-xs font-semibold ${promo.enabled ? 'text-emerald-600' : 'text-charcoal/60'}`}>
                        {promo.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-xs text-charcoal/70">
                      Scope: {promo.scope === 'global' ? 'Global' : `Categories (${promo.categorySlugs.length})`}
                    </div>
                    <div className="text-xs text-charcoal/70">Schedule: {formatRange(promo.startsAt, promo.endsAt)}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => togglePromotionEnabled(promo)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        {promo.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditPromotion(promo)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removePromotion(promo)}
                        className="lux-button--outline px-3 py-1 text-[10px] !border-rose-200 !text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h3 className="lux-heading text-lg">Promo Codes</h3>
            <p className="text-sm text-charcoal/70">Create percentage and free-shipping codes.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lux-panel p-4 space-y-4">
              <div className="text-sm font-semibold text-charcoal">
                {editingPromoCodeId ? 'Edit Promo Code' : 'Create Promo Code'}
              </div>
              <div className="space-y-3">
                <label className="block lux-label text-[10px]">Code</label>
                <input
                  type="text"
                  value={promoCodeForm.code}
                  onChange={(e) => handlePromoCodeFormChange('code', e.target.value.toUpperCase())}
                  className="lux-input text-sm uppercase tracking-[0.2em]"
                />
                <label className="block lux-label text-[10px]">Percent off</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={promoCodeForm.percentOff}
                  onChange={(e) => handlePromoCodeFormChange('percentOff', e.target.value)}
                  placeholder="10%"
                  className="lux-input text-sm"
                />
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={promoCodeForm.freeShipping}
                    onChange={(e) => handlePromoCodeFormChange('freeShipping', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Free shipping
                </label>
                <label className="block lux-label text-[10px]">Scope</label>
                <select
                  value={promoCodeForm.scope}
                  onChange={(e) => handlePromoCodeFormChange('scope', e.target.value)}
                  className="lux-input text-[11px] uppercase tracking-[0.22em] font-semibold"
                >
                  <option value="global">GLOBAL</option>
                  <option value="categories">CATEGORIES</option>
                </select>
                {promoCodeForm.scope === 'categories' && (
                  <div className="space-y-2">
                    <div className="lux-label text-[10px]">Categories</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {categoryOptions.map((category) => {
                        const checked = promoCodeForm.categorySlugs.includes(category.slug);
                        return (
                          <label key={category.slug} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...promoCodeForm.categorySlugs, category.slug]
                                  : promoCodeForm.categorySlugs.filter((slug) => slug !== category.slug);
                                handlePromoCodeFormChange('categorySlugs', next);
                              }}
                              className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                            />
                            <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
                              {category.name?.toUpperCase() || 'CATEGORY'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label className="block lux-label text-[10px]">Starts at</label>
                <input
                  type="datetime-local"
                  value={promoCodeForm.startsAt}
                  onChange={(e) => handlePromoCodeFormChange('startsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Ends at</label>
                <input
                  type="datetime-local"
                  value={promoCodeForm.endsAt}
                  onChange={(e) => handlePromoCodeFormChange('endsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={promoCodeForm.enabled}
                    onChange={(e) => handlePromoCodeFormChange('enabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Enabled
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitPromoCode}
                  disabled={saving}
                  className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
                >
                  {editingPromoCodeId ? 'Update' : 'Create'}
                </button>
                {editingPromoCodeId && (
                  <button
                    type="button"
                    onClick={resetPromoCodeForm}
                    className="lux-button--ghost px-4 py-2 text-[10px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {promoCodes.length === 0 ? (
                <div className="lux-panel p-4 text-sm text-charcoal/70">
                  No promo codes yet.
                </div>
              ) : (
                promoCodes.map((code) => (
                  <div key={code.id} className="lux-panel p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-charcoal">{code.code.toUpperCase()}</div>
                        <div className="text-xs text-charcoal/60">
                          {code.percentOff ? `${code.percentOff}% off` : 'No percent'} •{' '}
                          {code.freeShipping ? 'Free shipping' : 'Paid shipping'}
                        </div>
                      </div>
                      <span className={`text-xs font-semibold ${code.enabled ? 'text-emerald-600' : 'text-charcoal/60'}`}>
                        {code.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-xs text-charcoal/70">
                      Scope: {code.scope === 'global' ? 'Global' : `Categories (${code.categorySlugs.length})`}
                    </div>
                    <div className="text-xs text-charcoal/70">Schedule: {formatRange(code.startsAt, code.endsAt)}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => togglePromoCodeEnabled(code)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        {code.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditPromoCode(code)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removePromoCode(code)}
                        className="lux-button--outline px-3 py-1 text-[10px] !border-rose-200 !text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
