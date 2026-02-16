import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { AdminSectionHeader } from './AdminSectionHeader';
import {
  adminCreateBoxPreset,
  adminDeleteBoxPreset,
  adminFetchShippingSettings,
  adminUpdateBoxPreset,
  adminUpdateShipFrom,
  type ShipFromSettings,
  type ShippingBoxPreset,
} from '../../lib/adminShipping';

type PresetDraft = {
  name: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  defaultWeightLb: string;
};

const emptyShipFrom: ShipFromSettings = {
  shipFromName: '',
  shipFromAddress1: '',
  shipFromAddress2: '',
  shipFromCity: '',
  shipFromState: '',
  shipFromPostal: '',
  shipFromCountry: 'US',
  shipFromPhone: '',
  updatedAt: null,
};

const emptyPresetDraft: PresetDraft = {
  name: '',
  lengthIn: '',
  widthIn: '',
  heightIn: '',
  defaultWeightLb: '',
};

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function AdminShippingSettingsTab() {
  const [shipFrom, setShipFrom] = useState<ShipFromSettings>(emptyShipFrom);
  const [boxPresets, setBoxPresets] = useState<ShippingBoxPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingShipFrom, setIsSavingShipFrom] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });
  const [newPreset, setNewPreset] = useState<PresetDraft>(emptyPresetDraft);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<PresetDraft>(emptyPresetDraft);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await adminFetchShippingSettings();
      setShipFrom(data.shipFrom || emptyShipFrom);
      setBoxPresets(data.boxPresets || []);
      setStatus({ type: null, message: '' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load shipping settings.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const activeEditingPreset = useMemo(
    () => boxPresets.find((preset) => preset.id === editingPresetId) || null,
    [boxPresets, editingPresetId]
  );

  useEffect(() => {
    if (!activeEditingPreset) return;
    setEditingDraft({
      name: activeEditingPreset.name,
      lengthIn: String(activeEditingPreset.lengthIn),
      widthIn: String(activeEditingPreset.widthIn),
      heightIn: String(activeEditingPreset.heightIn),
      defaultWeightLb:
        activeEditingPreset.defaultWeightLb === null || activeEditingPreset.defaultWeightLb === undefined
          ? ''
          : String(activeEditingPreset.defaultWeightLb),
    });
  }, [activeEditingPreset]);

  const handleSaveShipFrom = async (event: FormEvent) => {
    event.preventDefault();
    setIsSavingShipFrom(true);
    try {
      const saved = await adminUpdateShipFrom(shipFrom);
      setShipFrom(saved);
      setStatus({ type: 'success', message: 'Ship-from settings saved.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save ship-from settings.',
      });
    } finally {
      setIsSavingShipFrom(false);
    }
  };

  const handleCreatePreset = async (event: FormEvent) => {
    event.preventDefault();
    const lengthIn = numberOrNull(newPreset.lengthIn);
    const widthIn = numberOrNull(newPreset.widthIn);
    const heightIn = numberOrNull(newPreset.heightIn);
    const defaultWeightLb = numberOrNull(newPreset.defaultWeightLb);
    if (!newPreset.name.trim() || lengthIn === null || widthIn === null || heightIn === null) {
      setStatus({ type: 'error', message: 'Preset name, length, width, and height are required.' });
      return;
    }

    setIsSavingPreset(true);
    try {
      const updated = await adminCreateBoxPreset({
        name: newPreset.name.trim(),
        lengthIn,
        widthIn,
        heightIn,
        defaultWeightLb,
      });
      setBoxPresets(updated);
      setNewPreset(emptyPresetDraft);
      setStatus({ type: 'success', message: 'Box preset created.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create box preset.',
      });
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleUpdatePreset = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingPresetId) return;
    const lengthIn = numberOrNull(editingDraft.lengthIn);
    const widthIn = numberOrNull(editingDraft.widthIn);
    const heightIn = numberOrNull(editingDraft.heightIn);
    const defaultWeightLb = numberOrNull(editingDraft.defaultWeightLb);
    if (!editingDraft.name.trim() || lengthIn === null || widthIn === null || heightIn === null) {
      setStatus({ type: 'error', message: 'Preset name, length, width, and height are required.' });
      return;
    }

    setIsSavingPreset(true);
    try {
      const updated = await adminUpdateBoxPreset(editingPresetId, {
        name: editingDraft.name.trim(),
        lengthIn,
        widthIn,
        heightIn,
        defaultWeightLb,
      });
      setBoxPresets(updated);
      setEditingPresetId(null);
      setStatus({ type: 'success', message: 'Box preset updated.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update box preset.',
      });
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    setDeletingId(presetId);
    try {
      const updated = await adminDeleteBoxPreset(presetId);
      setBoxPresets(updated);
      if (editingPresetId === presetId) setEditingPresetId(null);
      setStatus({ type: 'success', message: 'Box preset deleted.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete box preset.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="lux-card p-6">
        <AdminSectionHeader
          title="Shipping Settings"
          subtitle="Configure ship-from address and package presets for Easyship labels."
        />

        {isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-charcoal/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shipping settings...
          </div>
        ) : (
          <form onSubmit={handleSaveShipFrom} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="lux-label mb-2 block">Name</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromName}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromName: e.target.value }))}
              />
            </div>
            <div>
              <label className="lux-label mb-2 block">Phone</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromPhone}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromPhone: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="lux-label mb-2 block">Address 1</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromAddress1}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromAddress1: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="lux-label mb-2 block">Address 2</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromAddress2}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromAddress2: e.target.value }))}
              />
            </div>
            <div>
              <label className="lux-label mb-2 block">City</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromCity}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromCity: e.target.value }))}
              />
            </div>
            <div>
              <label className="lux-label mb-2 block">State</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromState}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromState: e.target.value }))}
              />
            </div>
            <div>
              <label className="lux-label mb-2 block">Postal Code</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromPostal}
                onChange={(e) => setShipFrom((prev) => ({ ...prev, shipFromPostal: e.target.value }))}
              />
            </div>
            <div>
              <label className="lux-label mb-2 block">Country</label>
              <input
                className="lux-input"
                value={shipFrom.shipFromCountry}
                onChange={(e) =>
                  setShipFrom((prev) => ({ ...prev, shipFromCountry: e.target.value.toUpperCase().slice(0, 2) }))
                }
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={isSavingShipFrom}
                className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
              >
                {isSavingShipFrom ? 'Saving...' : 'Save Ship-From'}
              </button>
              {shipFrom.updatedAt && (
                <span className="text-xs text-charcoal/60">Last updated: {new Date(shipFrom.updatedAt).toLocaleString()}</span>
              )}
            </div>
          </form>
        )}
      </div>

      <div className="lux-card p-6">
        <AdminSectionHeader
          title="Box Presets"
          subtitle="Use presets for consistent parcel dimensions and default weights."
        />

        <form onSubmit={handleCreatePreset} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-6">
          <input
            className="lux-input md:col-span-2"
            placeholder="Preset name"
            value={newPreset.name}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="lux-input"
            placeholder="Length (in)"
            value={newPreset.lengthIn}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, lengthIn: e.target.value }))}
          />
          <input
            className="lux-input"
            placeholder="Width (in)"
            value={newPreset.widthIn}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, widthIn: e.target.value }))}
          />
          <input
            className="lux-input"
            placeholder="Height (in)"
            value={newPreset.heightIn}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, heightIn: e.target.value }))}
          />
          <input
            className="lux-input"
            placeholder="Default wt (lb)"
            value={newPreset.defaultWeightLb}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, defaultWeightLb: e.target.value }))}
          />
          <div className="md:col-span-6">
            <button
              type="submit"
              disabled={isSavingPreset}
              className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
            >
              {isSavingPreset ? 'Saving...' : 'Add Preset'}
            </button>
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {boxPresets.length === 0 ? (
            <div className="text-sm text-charcoal/60">No presets yet.</div>
          ) : (
            boxPresets.map((preset) => (
              <div key={preset.id} className="lux-panel p-3">
                {editingPresetId === preset.id ? (
                  <form onSubmit={handleUpdatePreset} className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <input
                      className="lux-input md:col-span-2"
                      value={editingDraft.name}
                      onChange={(e) => setEditingDraft((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <input
                      className="lux-input"
                      value={editingDraft.lengthIn}
                      onChange={(e) => setEditingDraft((prev) => ({ ...prev, lengthIn: e.target.value }))}
                    />
                    <input
                      className="lux-input"
                      value={editingDraft.widthIn}
                      onChange={(e) => setEditingDraft((prev) => ({ ...prev, widthIn: e.target.value }))}
                    />
                    <input
                      className="lux-input"
                      value={editingDraft.heightIn}
                      onChange={(e) => setEditingDraft((prev) => ({ ...prev, heightIn: e.target.value }))}
                    />
                    <input
                      className="lux-input"
                      value={editingDraft.defaultWeightLb}
                      onChange={(e) => setEditingDraft((prev) => ({ ...prev, defaultWeightLb: e.target.value }))}
                    />
                    <div className="md:col-span-6 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isSavingPreset}
                        className="lux-button px-3 py-2 text-[10px] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="lux-button--ghost px-3 py-2 text-[10px]"
                        onClick={() => setEditingPresetId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-charcoal">{preset.name}</div>
                      <div className="text-xs text-charcoal/70">
                        {preset.lengthIn}" x {preset.widthIn}" x {preset.heightIn}" | default wt:{' '}
                        {preset.defaultWeightLb ?? '-'} lb
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="lux-button--ghost px-3 py-2 text-[10px]"
                        onClick={() => setEditingPresetId(preset.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="lux-button--ghost px-3 py-2 text-[10px] !text-rose-700"
                        disabled={deletingId === preset.id}
                        onClick={() => void handleDeletePreset(preset.id)}
                      >
                        {deletingId === preset.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {status.type && (
        <div
          className={`rounded-shell px-4 py-2 text-sm ${
            status.type === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}

