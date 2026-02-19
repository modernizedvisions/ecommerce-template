import { formatEasternDateTime } from './dates';

export const formatDateTime = (value?: string | number | Date | null): string =>
  formatEasternDateTime(value) || '';

