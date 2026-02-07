import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AdminSectionHeader } from './AdminSectionHeader';
import { AdminSaveButton } from './AdminSaveButton';
import { adminFetchCustomOrderExamples, adminSaveCustomOrderExamples, adminUploadImageScoped } from '../../lib/api';

type ExampleSlot = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  tags: string;
  sortOrder: number;
  isActive: boolean;
  isUploading?: boolean;
  uploadError?: string | null;
};

const SLOT_COUNT = 9;

const buildEmptySlots = (): ExampleSlot[] =>
  Array.from({ length: SLOT_COUNT }).map((_, idx) => ({
    id: crypto.randomUUID(),
    imageUrl: '',
    title: '',
    description: '',
    tags: '',
    sortOrder: idx,
    isActive: false,
    isUploading: false,
    uploadError: null,
  }));

export function AdminCustomOrderExamplesTab() {
  const [slots, setSlots] = useState<ExampleSlot[]>(() => buildEmptySlots());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        const examples = await adminFetchCustomOrderExamples();
        if (!isMounted) return;
        const ordered = [...examples].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        const next = buildEmptySlots().map((slot, idx) => {
          const ex = ordered[idx];
          if (!ex) return slot;
          return {
            ...slot,
            id: ex.id || slot.id,
            imageUrl: ex.imageUrl || '',
            title: ex.title || '',
            description: ex.description || '',
            tags: Array.isArray(ex.tags) ? ex.tags.join(', ') : '',
            sortOrder: idx,
            isActive: ex.isActive ?? !!ex.imageUrl,
          };
        });
        setSlots(next);
      } catch (err) {
        toast.error('Failed to load custom order examples');
        setSlots(buildEmptySlots());
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const hasBlockingIssues = useMemo(
    () => slots.some((slot) => slot.isUploading || slot.uploadError),
    [slots]
  );

  const handleFileSelect = async (index: number, file: File) => {
    setSlots((prev) =>
      prev.map((slot, idx) =>
        idx === index
          ? {
              ...slot,
              isUploading: true,
              uploadError: null,
            }
          : slot
      )
    );
    try {
      const result = await adminUploadImageScoped(file, { scope: 'custom-orders' });
      setSlots((prev) =>
        prev.map((slot, idx) =>
          idx === index
            ? {
                ...slot,
                imageUrl: result.url,
                isActive: true,
                isUploading: false,
                uploadError: null,
              }
            : slot
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setSlots((prev) =>
        prev.map((slot, idx) =>
          idx === index
            ? {
                ...slot,
                isUploading: false,
                uploadError: message,
              }
            : slot
        )
      );
      toast.error(message);
    }
  };

  const handleClearImage = (index: number) => {
    setSlots((prev) =>
      prev.map((slot, idx) =>
        idx === index
          ? {
              ...slot,
              imageUrl: '',
              isActive: false,
              uploadError: null,
            }
          : slot
      )
    );
  };

  const handleFieldChange = (index: number, field: 'title' | 'description' | 'tags', value: string) => {
    setSlots((prev) =>
      prev.map((slot, idx) => (idx === index ? { ...slot, [field]: value } : slot))
    );
  };

  const handleSave = async () => {
    if (hasBlockingIssues) {
      toast.error('Fix uploads before saving.');
      return;
    }
    const invalid = slots.find(
      (slot) => slot.imageUrl && (!slot.title.trim() || !slot.description.trim())
    );
    if (invalid) {
      toast.error('Title and description are required for each uploaded example.');
      return;
    }

    setSaveState('saving');
    try {
      const payload = slots.map((slot, idx) => ({
        id: slot.id,
        imageUrl: slot.imageUrl || '',
        title: slot.title.trim(),
        description: slot.description.trim(),
        tags: slot.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        sortOrder: idx,
        isActive: !!slot.imageUrl,
      }));
      const saved = await adminSaveCustomOrderExamples(payload);
      const ordered = [...saved].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const next = buildEmptySlots().map((slot, idx) => {
        const ex = ordered[idx];
        if (!ex) return slot;
        return {
          ...slot,
          id: ex.id || slot.id,
          imageUrl: ex.imageUrl || '',
          title: ex.title || '',
          description: ex.description || '',
          tags: Array.isArray(ex.tags) ? ex.tags.join(', ') : '',
          sortOrder: idx,
          isActive: ex.isActive ?? !!ex.imageUrl,
        };
      });
      setSlots(next);
      setSaveState('success');
      toast.success('Custom order examples saved.');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      toast.error(err instanceof Error ? err.message : 'Failed to save examples.');
    }
  };

  return (
    <div className="lux-card p-6">
      <div className="relative">
        <div className="w-full text-center">
          <AdminSectionHeader
            title="Custom Order Examples"
            subtitle="Manage the 9 custom examples shown on the Custom Orders page."
          />
        </div>
        <div className="absolute right-0 top-0">
          <AdminSaveButton
            saveState={saveState}
            onClick={handleSave}
            disabled={saveState === 'saving' || hasBlockingIssues}
            idleLabel="Save Examples"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-charcoal/60">Loading examples...</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {slots.map((slot, idx) => (
            <div key={slot.id} className="lux-panel p-3 space-y-3">
              <div className="relative aspect-[4/5] bg-linen/80 rounded-shell-lg overflow-hidden flex items-center justify-center">
                {slot.imageUrl ? (
                  <img src={slot.imageUrl} alt={slot.title || `Example ${idx + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="text-[11px] uppercase tracking-[0.2em] text-charcoal/60 flex flex-col items-center gap-2 font-semibold">
                    <Plus className="h-5 w-5" />
                    Empty Slot
                  </div>
                )}
                {slot.isUploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/70">
                    Uploading...
                  </div>
                )}
              </div>

              {slot.uploadError && (
                <div className="rounded-shell border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                  {slot.uploadError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[idx]?.click()}
                  className="lux-button--ghost px-3 py-1 text-[10px]"
                >
                  <Upload className="h-4 w-4" />
                  {slot.imageUrl ? 'Replace' : 'Upload'}
                </button>
                {slot.imageUrl && (
                  <button
                    type="button"
                    onClick={() => handleClearImage(idx)}
                    className="lux-button--ghost px-2 py-1 text-[10px]"
                  >
                    Clear
                  </button>
                )}
                <input
                  ref={(el) => {
                    fileInputRefs.current[idx] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileSelect(idx, file);
                    if (fileInputRefs.current[idx]) fileInputRefs.current[idx]!.value = '';
                  }}
                />
              </div>

              <div>
                <label className="lux-label text-[10px] mb-2">Title</label>
                <input
                  type="text"
                  value={slot.title}
                  onChange={(e) => handleFieldChange(idx, 'title', e.target.value)}
                  className="lux-input text-sm"
                />
              </div>
              <div>
                <label className="lux-label text-[10px] mb-2">Description</label>
                <textarea
                  rows={3}
                  value={slot.description}
                  onChange={(e) => handleFieldChange(idx, 'description', e.target.value)}
                  className="lux-input text-sm resize-none"
                />
              </div>
              <div>
                <label className="lux-label text-[10px] mb-2">Tags</label>
                <input
                  type="text"
                  value={slot.tags}
                  onChange={(e) => handleFieldChange(idx, 'tags', e.target.value)}
                  placeholder="wedding, coastal, gold"
                  className="lux-input text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
