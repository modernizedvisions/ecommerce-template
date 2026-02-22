import React from 'react';
import { Eye, EyeOff, Plus, Trash2, Upload } from 'lucide-react';
import { AdminSectionHeader } from './AdminSectionHeader';
import { AdminSaveButton } from './AdminSaveButton';
import { adminUploadImageUnified } from '../../lib/api';
import { ProgressiveImage } from '../ui/ProgressiveImage';

export type AdminGalleryItem = {
  id: string;
  url: string | null;
  imageId?: string | null;
  previewUrl?: string | null;
  alt?: string;
  hidden?: boolean;
  position?: number;
  createdAt?: string;
  isOptimizing?: boolean;
  isUploading?: boolean;
  uploadError?: string | null;
  file?: File;
};

export interface AdminGalleryTabProps {
  images: AdminGalleryItem[];
  onChange: React.Dispatch<React.SetStateAction<AdminGalleryItem[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  fileInputRef: React.RefObject<HTMLInputElement>;
  title?: string;
  description?: string;
  maxImages?: number;
}

export function AdminGalleryTab(props: AdminGalleryTabProps) {
  return (
    <GalleryAdmin
      images={props.images}
      onChange={props.onChange}
      onSave={props.onSave}
      saveState={props.saveState}
      fileInputRef={props.fileInputRef}
      title={props.title}
      description={props.description}
      maxImages={props.maxImages}
    />
  );
}

interface GalleryAdminProps {
  images: AdminGalleryItem[];
  onChange: React.Dispatch<React.SetStateAction<AdminGalleryItem[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  fileInputRef: React.RefObject<HTMLInputElement>;
  title?: string;
  description?: string;
  maxImages?: number;
}

function GalleryAdmin({
  images,
  onChange,
  onSave,
  saveState,
  fileInputRef,
  title = 'Gallery Management',
  description = 'Add, hide, or remove gallery images.', // Uses PUT /api/gallery with payload { images: GalleryImage[] }
  maxImages,
}: GalleryAdminProps) {
  const hasBlockingIssues = images.some((img) => img.isUploading || img.uploadError || !img.url);

  const handleAddImages = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    const allowed = typeof maxImages === 'number' ? Math.max(0, maxImages - images.length) : undefined;
    const selected = typeof allowed === 'number' ? fileArray.slice(0, allowed) : fileArray;
    if (!selected.length) return;

    const queued: AdminGalleryItem[] = selected.map((file, index) => {
      const previewUrl = URL.createObjectURL(file);
      return {
        id: crypto.randomUUID(),
        url: null,
        alt: file.name,
        hidden: false,
        createdAt: new Date().toISOString(),
        position: images.length + index,
        isOptimizing: true,
        isUploading: true,
        uploadError: undefined,
        previewUrl,
        file,
      };
    });

    onChange([...images, ...queued]);

    const runUploads = async () => {
      for (const img of queued) {
        if (!img.file) continue;
        try {
          const result = await adminUploadImageUnified(img.file, {
            scope: 'gallery',
            onStatus: (status) => {
              onChange((prev) =>
                prev.map((entry) =>
                  entry.id === img.id
                    ? {
                        ...entry,
                        isOptimizing: status === 'optimizing',
                        isUploading: true,
                      }
                    : entry
                )
              );
            },
          });
          if (img.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
          onChange((prev) =>
            prev.map((entry) =>
              entry.id === img.id
                ? {
                    ...entry,
                    url: result.url,
                    imageId: result.imageId ?? null,
                    previewUrl: result.url,
                    isOptimizing: false,
                    isUploading: false,
                    uploadError: undefined,
                    file: undefined,
                  }
                : entry
            )
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          onChange((prev) =>
            prev.map((entry) =>
              entry.id === img.id
                ? {
                    ...entry,
                    isOptimizing: false,
                    isUploading: false,
                    uploadError: message,
                  }
                : entry
            )
          );
        } finally {
          onChange((prev) =>
            prev.map((entry) =>
              entry.id === img.id && entry.isUploading
                ? {
                    ...entry,
                    isOptimizing: false,
                    isUploading: false,
                  }
                : entry
            )
          );
        }
      }
    };

    void runUploads();
  };

  const handleRemove = (id: string) => {
    const target = images.find((img) => img.id === id);
    if (target?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onChange(images.filter((img) => img.id !== id));
  };

  const handleToggleVisibility = (id: string) => {
    onChange(
      images.map((img) =>
        img.id === id
          ? {
              ...img,
              hidden: !img.hidden,
            }
          : img
      )
    );
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const idx = images.findIndex((img) => img.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= images.length) return;

    const newImages = [...images];
    [newImages[idx], newImages[targetIdx]] = [newImages[targetIdx], newImages[idx]];
    onChange(newImages);
  };

  const handleRetry = async (id: string) => {
    const target = images.find((img) => img.id === id);
    if (!target?.file) return;
    onChange((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              isUploading: true,
              uploadError: undefined,
            }
          : img
      )
    );
    try {
      const result = await adminUploadImageUnified(target.file, { scope: 'gallery' });
      if (target.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      onChange((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                url: result.url,
                imageId: result.imageId ?? null,
                previewUrl: result.url,
                isUploading: false,
                uploadError: undefined,
                file: undefined,
              }
            : img
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      onChange((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                isUploading: false,
                uploadError: message,
              }
            : img
        )
      );
    } finally {
      onChange((prev) =>
        prev.map((img) =>
          img.id === id && img.isUploading
            ? {
                ...img,
                isUploading: false,
              }
            : img
        )
      );
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleAddImages(e.dataTransfer.files);
  };

  return (
    <div className="lux-card p-6">
      <div className="mb-4">
        <AdminSectionHeader title={title} subtitle={description} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
          <AdminSaveButton
            saveState={saveState}
            onClick={onSave}
            disabled={saveState === 'saving' || hasBlockingIssues}
            idleLabel="SAVE"
            className="sm:w-auto"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="lux-button--ghost px-3 py-2 text-[10px]"
          >
            <Upload className="w-4 h-4" />
            Upload Images
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleAddImages(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.2em] font-semibold text-charcoal/60">
          {saveState === 'saving' && 'Saving Changes...'}
          {saveState === 'success' && 'Gallery Saved.'}
          {saveState === 'error' && 'Save Failed. Please Retry.'}
          {saveState === 'idle' && images.length === 0 && 'No Images Saved Yet.'}
        </div>
      </div>

      <div
        className="rounded-shell-lg border-2 border-dashed border-driftwood/70 bg-linen/70 p-4 text-center text-charcoal/60 cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <Upload className="w-5 h-5" />
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold">Drag and drop images here, or click to browse.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
        {images.map((img, idx) => (
          <div key={img.id} className="relative group rounded-shell-lg overflow-hidden border border-driftwood/60 bg-white/80">
            <div className="aspect-square bg-linen/80">
              <ProgressiveImage
                src={img.previewUrl || img.url || ''}
                alt={img.alt || `Gallery image ${idx + 1}`}
                className="h-full w-full"
                imgClassName="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
              {img.isUploading && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/70">
                  {img.isOptimizing ? 'Optimizing image...' : 'Uploading...'}
                </div>
              )}
            </div>
            {img.uploadError && (
              <div className="absolute inset-x-0 top-0 bg-red-600/90 text-white text-[10px] px-2 py-1">
                Upload failed
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between text-white text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(img.id)}
                  className="inline-flex items-center gap-1 bg-white/10 px-2 py-1 rounded-shell hover:bg-white/20"
                >
                  {!img.hidden ? (
                    <>
                      <Eye className="w-3 h-3" />
                      Visible
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3" />
                      Hidden
                    </>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  {img.uploadError && img.file && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRetry(img.id);
                      }}
                      className="bg-white/10 px-2 py-1 rounded-shell hover:bg-white/20"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleMove(img.id, 'up')}
                    className="bg-white/10 px-2 py-1 rounded-shell hover:bg-white/20"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(img.id, 'down')}
                    className="bg-white/10 px-2 py-1 rounded-shell hover:bg-white/20"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(img.id)}
                    className="inline-flex items-center gap-1 bg-red-600 px-2 py-1 rounded-shell hover:bg-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute top-2 left-2">
              <span className="inline-flex items-center rounded-ui bg-white/90 px-2 py-0.5 text-[10px] font-medium text-charcoal shadow-sm">
                #{idx + 1}
              </span>
            </div>
          </div>
        ))}

        {images.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center text-charcoal/60 py-8 border border-dashed border-driftwood/70 rounded-shell-lg">
            <Plus className="w-6 h-6 mb-2" />
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold">No Images Uploaded Yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

