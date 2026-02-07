import { useEffect, useMemo, useState } from 'react';
import type { GalleryImage } from '../lib/types';

interface HeroSlideshowProps {
  images: GalleryImage[];
  intervalMs?: number;
}

export function HeroSlideshow({ images, intervalMs = 3000 }: HeroSlideshowProps) {
  const slides = useMemo(
    () => (images || []).filter((img) => img?.imageUrl).map((img) => ({ ...img, hidden: false })),
    [images]
  );
  const [index, setIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState(false);

  const canRotate = slides.length > 1 && !prefersReducedMotion && !isDocumentHidden;

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setIsDocumentHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (slides.length === 0) return;
    setIndex((current) => (current >= slides.length ? 0 : current));
  }, [slides.length]);

  useEffect(() => {
    if (!canRotate) return;
    let fadeTimeout: number | null = null;
    if (import.meta.env.DEV) {
      console.debug('[hero rotation] start interval', { count: slides.length, intervalMs });
    }
    const timer = window.setInterval(() => {
      setIsFading(true);
      fadeTimeout = window.setTimeout(() => {
        setIndex((current) => {
          const next = (current + 1) % slides.length;
          if (import.meta.env.DEV) {
            console.debug('[hero rotation] tick', { next });
          }
          return next;
        });
        setIsFading(false);
      }, 180);
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
      if (fadeTimeout) window.clearTimeout(fadeTimeout);
    };
  }, [canRotate, intervalMs, slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const nextIndex = (index + 1) % slides.length;
    const next = slides[nextIndex];
    if (next?.imageUrl) {
      const img = new Image();
      img.src = next.imageUrl;
    }
  }, [index, slides]);

  if (slides.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">
        Gallery images will appear here
      </div>
    );
  }

  const active = slides[index];

  return (
    <div className="h-full w-full">
      <img
        src={active.imageUrl}
        alt={active.title || 'Gallery image'}
        className="h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: isFading ? 0 : 1, transition: prefersReducedMotion ? 'none' : undefined }}
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
        fetchpriority={index === 0 ? 'high' : undefined}
      />
    </div>
  );
}

export default HeroSlideshow;
