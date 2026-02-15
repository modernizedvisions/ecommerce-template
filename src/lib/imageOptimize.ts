export type ImagePreset = 'thumb' | 'medium' | 'full';

const DEFAULT_THUMB_WIDTH = 700;
const DEFAULT_MEDIUM_WIDTH = 900;
const DEFAULT_QUALITY = 75;

// Acceptance checks:
// - VITE_IMAGE_OPTIMIZER='off': images load as before (no src changes).
// - VITE_IMAGE_OPTIMIZER='cdncgi': shop, gallery, and custom-order grids load normally.
// - If /cdn-cgi/image fails, images still load via fallback.
// - ProgressiveImage img has "block" to prevent whitespace gaps.
// Rollback: set VITE_IMAGE_OPTIMIZER='off' and redeploy, or revert this commit.

export function buildOptimizedImageSrc(
  inputSrc: string,
  preset: ImagePreset
): { primarySrc: string; fallbackSrc: string } {
  const fallbackSrc = inputSrc;
  const hintedSrc = addWidthHint(inputSrc, preset);

  try {
    if (!inputSrc || preset === 'full' || inputSrc.includes('/cdn-cgi/image')) {
      return { primarySrc: fallbackSrc, fallbackSrc };
    }

    const optimizer = (import.meta.env.VITE_IMAGE_OPTIMIZER || 'off').toLowerCase();
    if (optimizer !== 'cdncgi') {
      return { primarySrc: hintedSrc, fallbackSrc };
    }

    const normalizedPath = normalizeImagesPath(inputSrc);
    if (!normalizedPath) {
      return { primarySrc: fallbackSrc, fallbackSrc };
    }

    const width =
      preset === 'thumb'
        ? parsePositiveInt(import.meta.env.VITE_IMAGE_THUMB_WIDTH, DEFAULT_THUMB_WIDTH)
        : DEFAULT_MEDIUM_WIDTH;
    const quality = parsePositiveInt(import.meta.env.VITE_IMAGE_QUALITY, DEFAULT_QUALITY);
    const pathWithoutSlash = normalizedPath.replace(/^\//, '');
    const primarySrc = `/cdn-cgi/image/width=${width},quality=${quality},format=auto/${pathWithoutSlash}`;

    return { primarySrc, fallbackSrc };
  } catch {
    return { primarySrc: fallbackSrc, fallbackSrc };
  }
}

function normalizeImagesPath(inputSrc: string): string | null {
  if (!inputSrc) return null;
  if (inputSrc.startsWith('/images/')) return inputSrc;

  try {
    const url = new URL(inputSrc);
    if (typeof window === 'undefined') return null;
    if (url.origin !== window.location.origin) return null;
    if (!url.pathname.startsWith('/images/')) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addWidthHint(inputSrc: string, preset: ImagePreset): string {
  if (!inputSrc || preset === 'full') return inputSrc;

  const width = preset === 'thumb' ? 600 : 900;
  try {
    if (inputSrc.startsWith('/images/')) {
      const [path, query = ''] = inputSrc.split('?', 2);
      const params = new URLSearchParams(query);
      if (!params.has('w')) params.set('w', String(width));
      const qs = params.toString();
      return qs ? `${path}?${qs}` : path;
    }

    const parsed = new URL(inputSrc);
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin && parsed.pathname.startsWith('/images/')) {
      if (!parsed.searchParams.has('w')) parsed.searchParams.set('w', String(width));
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return inputSrc;
  }

  return inputSrc;
}
