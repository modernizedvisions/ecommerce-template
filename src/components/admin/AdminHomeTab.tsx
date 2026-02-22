import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CustomOrdersImage, HeroCollageImage, HomeGalleryItem, HomeSiteContent } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';
import { AdminSaveButton } from './AdminSaveButton';
import { adminUploadImageUnified, getAdminSiteContentHome, updateAdminSiteContentHome } from '../../lib/api';
import { ProgressiveImage } from '../ui/ProgressiveImage';

export function AdminHomeTab() {
  const [heroImages, setHeroImages] = useState<HeroCollageImage[]>([]);
  const [homeGallery, setHomeGallery] = useState<HomeGalleryItem[]>([]);
  const [aboutImages, setAboutImages] = useState<CustomOrdersImage[]>([]);
  const [heroRotationEnabled, setHeroRotationEnabled] = useState(false);
  const [homeContent, setHomeContent] = useState<HomeSiteContent>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHomeContent = async () => {
      setLoadState('loading');
      setError(null);
      try {
        const content = await getAdminSiteContentHome();
        setHomeContent(content || {});
        const { hero, rotation, homeGallery, aboutImages } = normalizeSiteContent(content);
        setHeroImages(hero);
        setHeroRotationEnabled(rotation);
        setHomeGallery(homeGallery);
        setAboutImages(aboutImages);
        setLoadState('idle');
      } catch (err) {
        console.error('Failed to load home content', err);
        setLoadState('error');
        setError(err instanceof Error ? err.message : 'Failed to load home content');
      }
    };
    loadHomeContent();
  }, []);

  const handleSave = async () => {
    setSaveState('saving');
    setError(null);
    try {
      const allImages = [...heroImages, ...homeGallery, ...aboutImages];
      const hasUploads = allImages.some((img) => img?.uploading);
      const hasErrors = allImages.some((img) => img?.uploadError);
      const hasInvalid = allImages.some(
        (img) => img?.imageUrl?.startsWith('blob:') || img?.imageUrl?.startsWith('data:')
      );
      if (hasUploads) throw new Error('Images are still uploading.');
      if (hasErrors) throw new Error('Fix failed uploads before saving.');
      if (hasInvalid) throw new Error('Images must be uploaded first (no blob/data URLs).');
      const restHomeContent = { ...homeContent } as Record<string, unknown>;
      if ('customOrderImages' in restHomeContent) {
        delete restHomeContent.customOrderImages;
      }
      const payload: HomeSiteContent = {
        ...(restHomeContent as HomeSiteContent),
        // Home content includes Hero, Home Gallery (Homepage), and About images.
        ...buildSiteContent(heroImages, heroRotationEnabled, homeGallery, aboutImages),
      };
      await updateAdminSiteContentHome(payload);
      setHomeContent(payload);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      console.error('Failed to save home content', err);
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Failed to save home content');
    }
  };

  return (
    <div className="space-y-12">
      <HeroCollageAdmin
        images={heroImages}
        onChange={setHeroImages}
        onSave={handleSave}
        saveState={saveState}
        heroRotationEnabled={heroRotationEnabled}
        onHeroRotationToggle={setHeroRotationEnabled}
      />

      {/* Removed legacy Custom Orders sidebar images section (unused in Dover). The 9x9 grid Custom Order Page images section remains. */}
      <HomeGalleryAdmin
        items={homeGallery}
        onChange={setHomeGallery}
        onSave={handleSave}
        saveState={saveState}
      />

      <AboutImagesAdmin
        images={aboutImages}
        onChange={setAboutImages}
        onSave={handleSave}
        saveState={saveState}
      />

      {(loadState === 'loading' || error) && (
        <div className="rounded-shell border border-driftwood/60 bg-linen/70 px-3 py-2 text-sm text-charcoal/80">
          {loadState === 'loading' && 'Loading home content...'}
          {error && loadState !== 'loading' && error}
        </div>
      )}
    </div>
  );
}

interface HeroCollageAdminProps {
  images: HeroCollageImage[];
  onChange: React.Dispatch<React.SetStateAction<HeroCollageImage[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  heroRotationEnabled?: boolean;
  onHeroRotationToggle?: (enabled: boolean) => void;
}

function HeroCollageAdmin({
  images,
  onChange,
  onSave,
  saveState,
  heroRotationEnabled = false,
  onHeroRotationToggle,
}: HeroCollageAdminProps) {
  const slots = [0, 1, 2];

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    onChange((prev) => {
      const next = [...prev];
      const existing = next[index];
      next[index] = {
        id: existing?.id || `hero-${index}-${crypto.randomUUID?.() || Date.now()}`,
        imageUrl: previewUrl,
        alt: existing?.alt,
        createdAt: existing?.createdAt || new Date().toISOString(),
        uploading: true,
        optimizing: true,
        uploadError: undefined,
        previewUrl,
      };
      return next;
    });

    try {
      const result = await adminUploadImageUnified(file, {
        scope: 'home',
        onStatus: (status) => {
          onChange((prev) => {
            const next = [...prev];
            const existing = next[index];
            if (existing) {
              next[index] = {
                ...existing,
                optimizing: status === 'optimizing',
                uploading: true,
              };
            }
            return next;
          });
        },
      });
      URL.revokeObjectURL(previewUrl);
      onChange((prev) => {
        const next = [...prev];
        const existing = next[index];
        if (existing) {
          next[index] = {
            ...existing,
            imageUrl: result.url,
            uploading: false,
            optimizing: false,
            uploadError: undefined,
            previewUrl: undefined,
          };
        } else {
          next[index] = { id: `hero-${index}`, imageUrl: result.url };
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      onChange((prev) => {
        const next = [...prev];
        const existing = next[index];
        if (existing) {
          next[index] = {
            ...existing,
            uploading: false,
            optimizing: false,
            uploadError: message,
          };
        }
        return next;
      });
    }
  };

  const handleAltChange = (index: number, alt: string) => {
    const existing = images[index];
    if (!existing) return;
    const next = [...images];
    next[index] = { ...existing, alt };
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange((prev) => {
      const next = [...prev];
      const existing = next[index];
      next[index] = existing ? { ...existing, imageUrl: '' } : { id: `hero-${index}`, imageUrl: '' };
      return next;
    });
  };

  return (
    <section className="space-y-4 lux-card p-4">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Hero Images"
          subtitle="main images on your site"
        />
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-shell border border-driftwood/60 bg-linen/70 px-3 py-2">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] font-semibold text-deep-ocean">Rotate Hero Images</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-charcoal/70">
              ON: rotate through all hero images. OFF: show only the first image.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
              checked={!!heroRotationEnabled}
              onChange={(e) => onHeroRotationToggle?.(e.target.checked)}
            />
            <span>{heroRotationEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="w-full sm:flex sm:justify-end">
          <AdminSaveButton saveState={saveState} onClick={onSave} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const image = images[slot];
          const inputId = `hero-collage-${slot}`;
          return (
            <div
              key={slot}
              className="lux-panel p-3 space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot, file);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">Hero Image {slot + 1}</div>
                <div className="flex items-center gap-2">
                  {image && (
                    <button type="button" onClick={() => handleRemove(slot)} className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    {image ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[3/4] rounded-shell border border-dashed border-driftwood/70 bg-linen/70 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <>
                    <ProgressiveImage
                      src={image.previewUrl || image.imageUrl}
                      alt={image.alt || `Hero image ${slot + 1}`}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {image.uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/80">
                        {image.optimizing ? 'Optimizing image...' : 'Uploading...'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-charcoal/60 text-[11px] uppercase tracking-[0.2em] font-semibold">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or Upload</span>
                  </div>
                )}
              </div>
              {image?.uploadError && (
                <div className="text-xs text-rose-700">{image.uploadError}</div>
              )}

              <div className="space-y-1">
                <label htmlFor={`${inputId}-alt`} className="lux-label text-[10px]">
                  Alt text / description
                </label>
                <input
                  id={`${inputId}-alt`}
                  type="text"
                  value={image?.alt || ''}
                  onChange={(e) => handleAltChange(slot, e.target.value)}
                  placeholder="Optional description"
                  className="lux-input text-sm"
                />
              </div>

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface HomeGalleryAdminProps {
  items: HomeGalleryItem[];
  onChange: React.Dispatch<React.SetStateAction<HomeGalleryItem[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
}

interface AboutImagesAdminProps {
  images: CustomOrdersImage[];
  onChange: React.Dispatch<React.SetStateAction<CustomOrdersImage[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
}

const normalizeHomeGallerySlots = (items: HomeGalleryItem[]): HomeGalleryItem[] => {
  const slots = Array.from({ length: 8 }, () => ({ imageUrl: '', descriptor: '' }));
  items.slice(0, 8).forEach((item, index) => {
    slots[index] = {
      imageUrl: item?.imageUrl || '',
      descriptor: item?.descriptor || '',
      alt: item?.alt,
      uploading: item?.uploading,
      optimizing: item?.optimizing,
      uploadError: item?.uploadError,
      previewUrl: item?.previewUrl,
    };
  });
  return slots;
};

function HomeGalleryAdmin({ items, onChange, onSave, saveState }: HomeGalleryAdminProps) {
  const slots = Array.from({ length: 8 }, (_, index) => index);

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    onChange((prev) => {
      const next = normalizeHomeGallerySlots(prev);
      next[index] = {
        ...(next[index] || { imageUrl: '', descriptor: '' }),
        imageUrl: previewUrl,
        uploading: true,
        optimizing: true,
        uploadError: undefined,
        previewUrl,
      };
      return next;
    });

    try {
      const result = await adminUploadImageUnified(file, {
        scope: 'home',
        onStatus: (status) => {
          onChange((prev) => {
            const updated = normalizeHomeGallerySlots(prev);
            const existing = updated[index];
            if (existing) {
              updated[index] = {
                ...existing,
                optimizing: status === 'optimizing',
                uploading: true,
              };
            }
            return updated;
          });
        },
      });
      URL.revokeObjectURL(previewUrl);
      onChange((prev) => {
        const updated = normalizeHomeGallerySlots(prev);
        updated[index] = {
          ...(updated[index] || {}),
          imageUrl: result.url,
          uploading: false,
          optimizing: false,
          uploadError: undefined,
          previewUrl: undefined,
        };
        return updated;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      onChange((prev) => {
        const updated = normalizeHomeGallerySlots(prev);
        updated[index] = {
          ...(updated[index] || {}),
          uploading: false,
          optimizing: false,
          uploadError: message,
        };
        return updated;
      });
    }
  };

  const handleDescriptorChange = (index: number, descriptor: string) => {
    onChange((prev) => {
      const next = normalizeHomeGallerySlots(prev);
      next[index] = { ...(next[index] || { imageUrl: '' }), descriptor };
      return next;
    });
  };

  const handleRemove = (index: number) => {
    onChange((prev) => {
      const next = normalizeHomeGallerySlots(prev);
      next[index] = {
        ...(next[index] || { imageUrl: '', descriptor: '' }),
        imageUrl: '',
        uploadError: undefined,
        uploading: false,
        optimizing: false,
        previewUrl: undefined,
      };
      return next;
    });
  };

  return (
    <section className="space-y-4 lux-card p-4">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Home Gallery (Homepage)"
          subtitle="Controls the Homepage Gallery section only (not the full Gallery page). Exactly 8 images."
        />
        <div className="w-full sm:flex sm:justify-end">
          <AdminSaveButton saveState={saveState} onClick={onSave} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((slot) => {
          const item = items[slot];
          const inputId = `home-gallery-${slot}`;
          return (
            <div
              key={slot}
              className="space-y-3 lux-panel p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot, file);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">Slot {slot + 1}</span>
                <div className="flex items-center gap-2">
                  {item?.imageUrl && (
                    <button type="button" onClick={() => handleRemove(slot)} className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    {item?.imageUrl ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[3/4] rounded-shell border border-dashed border-driftwood/70 bg-linen/70 flex items-center justify-center overflow-hidden">
                {item?.imageUrl ? (
                  <>
                    <ProgressiveImage
                      src={item.previewUrl || item.imageUrl}
                      alt={item.alt || `Home gallery ${slot + 1}`}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {item.uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/80">
                        {item.optimizing ? 'Optimizing image...' : 'Uploading...'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-charcoal/60 text-[11px] uppercase tracking-[0.2em] font-semibold">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or Upload</span>
                  </div>
                )}
              </div>
              {item?.uploadError && (
                <div className="text-xs text-rose-700">{item.uploadError}</div>
              )}

              <div className="space-y-1">
                <label htmlFor={`${inputId}-descriptor`} className="lux-label text-[10px]">
                  Descriptor (pill text)
                </label>
                <input
                  id={`${inputId}-descriptor`}
                  type="text"
                  value={item?.descriptor || ''}
                  onChange={(e) => handleDescriptorChange(slot, e.target.value)}
                  placeholder="Optional short label"
                  className="lux-input text-sm"
                />
              </div>

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AboutImagesAdmin({ images, onChange, onSave, saveState }: AboutImagesAdminProps) {
  const slots = [
    { label: 'Homepage About Image', index: 0 },
    { label: 'About Page Image', index: 1 },
  ];

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    onChange((prev) => {
      const next = [...prev];
      next[index] = {
        ...(next[index] || { imageUrl: '' }),
        imageUrl: previewUrl,
        uploading: true,
        optimizing: true,
        uploadError: undefined,
        previewUrl,
      };
      return next.slice(0, 2);
    });

    try {
      const result = await adminUploadImageUnified(file, {
        scope: 'home',
        onStatus: (status) => {
          onChange((prev) => {
            const updated = [...prev];
            const existing = updated[index];
            if (existing) {
              updated[index] = {
                ...existing,
                optimizing: status === 'optimizing',
                uploading: true,
              };
            }
            return updated.slice(0, 2);
          });
        },
      });
      URL.revokeObjectURL(previewUrl);
      onChange((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...(updated[index] || {}),
          imageUrl: result.url,
          uploading: false,
          optimizing: false,
          uploadError: undefined,
          previewUrl: undefined,
        };
        return updated.slice(0, 2);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      onChange((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...(updated[index] || {}),
          uploading: false,
          optimizing: false,
          uploadError: message,
        };
        return updated.slice(0, 2);
      });
    }
  };

  const handleRemove = (index: number) => {
    onChange((prev) => {
      const next = [...prev];
      next[index] = { ...(next[index] || { imageUrl: '' }), imageUrl: '' };
      return next.slice(0, 2);
    });
  };

  return (
    <section className="space-y-4 lux-card p-4">
      <div className="space-y-2">
        <AdminSectionHeader
          title="About Images"
          subtitle="Used on both the Homepage About section and the About page."
        />
        <div className="w-full sm:flex sm:justify-end">
          <AdminSaveButton saveState={saveState} onClick={onSave} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const image = images[slot.index];
          const inputId = `about-image-${slot.index}`;
          return (
            <div
              key={slot.label}
              className="space-y-3 lux-panel p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot.index, file);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">{slot.label.toUpperCase()}</span>
                <div className="flex items-center gap-2">
                  {image?.imageUrl && (
                    <button type="button" onClick={() => handleRemove(slot.index)} className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    {image?.imageUrl ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[4/5] rounded-shell border border-dashed border-driftwood/70 bg-linen/70 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <>
                    <ProgressiveImage
                      src={image.previewUrl || image.imageUrl}
                      alt={slot.label}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {image.uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/80">
                        {image.optimizing ? 'Optimizing image...' : 'Uploading...'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-charcoal/60 text-[11px] uppercase tracking-[0.2em] font-semibold">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or Upload</span>
                  </div>
                )}
              </div>
              {image?.uploadError && (
                <div className="text-xs text-rose-700">{image.uploadError}</div>
              )}

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot.index, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

const normalizeSiteContent = (content: HomeSiteContent) => {
  const hero: HeroCollageImage[] = Array.from({ length: 3 }, (_, index) => ({
    id: `hero-${index}`,
    imageUrl: '',
  }));
  if (content.heroImages?.left) hero[0] = { id: 'hero-left', imageUrl: content.heroImages.left };
  if (content.heroImages?.middle) hero[1] = { id: 'hero-middle', imageUrl: content.heroImages.middle };
  if (content.heroImages?.right) hero[2] = { id: 'hero-right', imageUrl: content.heroImages.right };

  const homeGallery = normalizeHomeGallerySlots(Array.isArray(content.homeGallery) ? content.homeGallery : []);

  const aboutImages = Array.from({ length: 2 }, () => ({ imageUrl: '' }));
  if (content.aboutImages?.home) aboutImages[0] = { imageUrl: content.aboutImages.home };
  if (content.aboutImages?.about) aboutImages[1] = { imageUrl: content.aboutImages.about };

  return {
    hero,
    rotation: !!content.heroRotationEnabled,
    homeGallery,
    aboutImages,
  };
};

const buildSiteContent = (
  hero: HeroCollageImage[],
  heroRotationEnabled: boolean,
  homeGallery: HomeGalleryItem[],
  aboutImages: CustomOrdersImage[]
): HomeSiteContent => {
  const heroImages = {
    left: hero[0]?.imageUrl || '',
    middle: hero[1]?.imageUrl || '',
    right: hero[2]?.imageUrl || '',
  };
  const homeGallerySlots = normalizeHomeGallerySlots(homeGallery).map((item) => ({
    imageUrl: item.imageUrl || '',
    descriptor: item.descriptor || '',
  }));
  const aboutImageUrls = {
    home: aboutImages[0]?.imageUrl || '',
    about: aboutImages[1]?.imageUrl || '',
  };
  return { heroImages, heroRotationEnabled, homeGallery: homeGallerySlots, aboutImages: aboutImageUrls };
};

