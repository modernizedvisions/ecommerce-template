import { useEffect, useRef, useState } from 'react';

type ProgressiveImageProps = {
  src: string;
  alt: string;
  fallbackSrc?: string;
  timeoutMs?: number;
  preferOptimized?: boolean;
  className?: string;
  imgClassName?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
  fetchPriority?: 'high' | 'low' | 'auto';
};

export function ProgressiveImage({
  src,
  alt,
  fallbackSrc,
  timeoutMs = 2500,
  preferOptimized = true,
  className,
  imgClassName,
  loading,
  decoding,
  fetchPriority,
}: ProgressiveImageProps) {
  const [displaySrc, setDisplaySrc] = useState(preferOptimized ? src : fallbackSrc || src);
  const [isLoaded, setIsLoaded] = useState(false);
  const [didFallback, setDidFallback] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasPosition = /\b(absolute|relative|fixed|sticky|static)\b/.test(className ?? '');
  const wrapperClass = `block ${hasPosition ? '' : 'relative'} ${className ?? ''}`.trim();

  useEffect(() => {
    setDisplaySrc(preferOptimized ? src : fallbackSrc || src);
    setIsLoaded(false);
    setDidFallback(false);
  }, [src, fallbackSrc, preferOptimized]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug('[img]', {
      original: fallbackSrc || src,
      optimized: src,
      final: displaySrc,
      didFallback,
    });
  }, [displaySrc, didFallback, fallbackSrc, src]);

  useEffect(() => {
    if (!preferOptimized) return;
    if (!fallbackSrc) return;
    if (isLoaded || didFallback) return;
    if (displaySrc !== src) return;

    timeoutRef.current = setTimeout(() => {
      setDisplaySrc(fallbackSrc);
      setDidFallback(true);
      setIsLoaded(false);
    }, timeoutMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [displaySrc, didFallback, fallbackSrc, isLoaded, preferOptimized, src, timeoutMs]);

  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;

    if (img.naturalWidth > 0) {
      clearTimeoutRef();
      setIsLoaded(true);
      return;
    }

    if (fallbackSrc && displaySrc !== fallbackSrc) {
      setDisplaySrc(fallbackSrc);
      setDidFallback(true);
      setIsLoaded(false);
      return;
    }

    setIsLoaded(true);
  }, [displaySrc, fallbackSrc]);

  const devDataAttrs = import.meta.env.DEV
    ? {
        'data-img-src': displaySrc,
        'data-img-fallback': fallbackSrc,
        'data-img-did-fallback': didFallback ? 'true' : 'false',
      }
    : {};

  return (
    <span className={wrapperClass} {...devDataAttrs}>
      <span
        aria-hidden="true"
        className={`absolute inset-0 bg-slate-100 transition-opacity duration-300 ${
          isLoaded ? 'opacity-0' : 'opacity-100 animate-pulse'
        }`}
      />
      <img
        ref={imgRef}
        src={displaySrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onLoad={() => {
          clearTimeoutRef();
          setIsLoaded(true);
        }}
        onError={() => {
          clearTimeoutRef();
          if (fallbackSrc && displaySrc !== fallbackSrc) {
            setDisplaySrc(fallbackSrc);
            setDidFallback(true);
            setIsLoaded(false);
            return;
          }
          setIsLoaded(true);
        }}
        className={`block ${imgClassName || ''} transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`.trim()}
      />
    </span>
  );
}
