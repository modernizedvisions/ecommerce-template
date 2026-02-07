export const EASTERN_TIME_ZONE = 'America/New_York';

const toDate = (value?: string | number | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const hasTzOffset = /([+-]\d{2}:?\d{2}|Z)$/i.test(trimmed);
    const isSqlTimestamp =
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed);
    const isIsoNoTz =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed) && !hasTzOffset;
    const normalized = isSqlTimestamp
      ? `${trimmed.replace(' ', 'T')}Z`
      : isIsoNoTz
      ? `${trimmed}Z`
      : trimmed;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const year = Number(lookup('year'));
  const month = Number(lookup('month'));
  const day = Number(lookup('day'));
  const hour = Number(lookup('hour'));
  const minute = Number(lookup('minute'));
  const second = Number(lookup('second'));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUtc - date.getTime()) / 60000;
};

export const formatEasternDateTime = (
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    ...options,
  });
};

export const formatEasternDate = (
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    ...options,
  });
};

export const toEasternDateTimeLocal = (value?: string | null): string => {
  if (!value) return '';
  const date = toDate(value);
  if (!date) return '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const year = lookup('year');
  const month = lookup('month');
  const day = lookup('day');
  const hour = lookup('hour');
  const minute = lookup('minute');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

export const fromEasternDateTimeLocal = (value?: string): string | null => {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(year + month + day + hour + minute)) return null;
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMinutes(utcDate, EASTERN_TIME_ZONE);
  const adjusted = new Date(utcDate.getTime() - offset * 60000);
  if (Number.isNaN(adjusted.getTime())) return null;
  return adjusted.toISOString();
};
