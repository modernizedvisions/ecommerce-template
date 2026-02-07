import { useEffect, useMemo, useState } from 'react';
import { fetchGalleryImages } from '../api';
import type { GalleryImage } from '../types';

export function useGalleryImages() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const data = await fetchGalleryImages();
        if (!mounted) return;
        const visible = (Array.isArray(data) ? data : []).filter((img) => !img.hidden && img.imageUrl);
        const sorted = [...visible].sort((a, b) => {
          const posA = typeof a.position === 'number' ? a.position : 0;
          const posB = typeof b.position === 'number' ? b.position : 0;
          if (posA !== posB) return posA - posB;
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          return 0;
        });
        setImages(sorted);
      } catch (err) {
        console.error('Failed to load gallery images', err);
        if (mounted) setImages([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const orderedImages = useMemo(() => images, [images]);

  return { images: orderedImages, isLoading };
}
