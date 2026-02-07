export function normalizeImageUrl(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/images/')) return trimmed;
  if (trimmed.startsWith('doverdesign/')) return `/images/${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/images\/(.+)$/);
      if (match?.[1]) return `/images/${match[1]}`;
      const idx = url.pathname.indexOf('/doverdesign/');
      if (idx >= 0) return `/images/${url.pathname.slice(idx + 1)}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
