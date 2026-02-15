export function normalizeImageUrl(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('/images/')) return trimmed;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/images\/(.+)$/);
      if (match?.[1]) {
        const suffix = url.search || '';
        return `/images/${match[1]}${suffix}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  if (/^[a-zA-Z0-9._-]+\/.+/.test(trimmed)) {
    return `/images/${trimmed}`;
  }

  return trimmed;
}

export function withImageWidthHint(url: string, width = 600): string {
  const normalized = normalizeImageUrl(url);
  if (!normalized.startsWith('/images/')) return normalized;

  const [path, existingQuery] = normalized.split('?', 2);
  const params = new URLSearchParams(existingQuery || '');
  if (!params.has('w')) {
    params.set('w', String(width));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
