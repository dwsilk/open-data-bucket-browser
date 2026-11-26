const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Decimal units, as S3 and the AWS console report them. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (withTime ? DATE_TIME : DATE).format(date);
}

/** The last segment of a key or folder prefix, keeping a folder's `/`. */
export function baseName(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key;
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return key.endsWith('/') ? `${name}/` : name;
}
