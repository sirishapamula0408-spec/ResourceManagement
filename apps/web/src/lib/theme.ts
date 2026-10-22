/**
 * Shared visual vocabulary, matching the Resource Board prototype.
 * Colours reference the CSS tokens in index.css so they follow light/dark mode.
 */

/** Identity colours for departments, avatars and projects (prototype palette). */
export const PALETTE = [
  '#0E8A8C',
  '#E8962A',
  '#9B3F7A',
  '#2F5D9E',
  '#3D8A4F',
  '#B5603A',
  '#6A5ACD',
  '#7A8B2E',
  '#C2413A',
  '#4E7A8C',
];

/**
 * Colour follows the entity, not its rank: the slot comes from the alphabetical list of all
 * names, so filtering by project never repaints what remains.
 */
export function identityColor(name: string, allNames: string[]): string {
  const i = [...allNames].sort().indexOf(name);
  return i < 0 ? 'var(--color-muted)' : PALETTE[i % PALETTE.length];
}

/** Heat map bands: 0 (bench), <50, 50-80, 80-100, >100 %. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(pct: number): HeatLevel {
  if (pct === 0) return 0;
  if (pct < 50) return 1;
  if (pct < 80) return 2;
  if (pct <= 100) return 3;
  return 4;
}

export const HEAT_CLASS: Record<HeatLevel, string> = {
  0: 'bg-panel2 text-muted',
  1: 'bg-amber-soft',
  2: 'bg-teal-soft',
  3: 'bg-green-soft',
  4: 'bg-plum-soft text-plum',
};

export const HEAT_LEGEND: { level: HeatLevel; label: string }[] = [
  { level: 1, label: '<50' },
  { level: 2, label: '50–80' },
  { level: 3, label: '80–100' },
  { level: 4, label: '>100' },
];

const numberFormat = (digits: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmt0 = numberFormat(0);
const fmt1 = numberFormat(1);

/** Prototype number style: en-IN grouping, fixed decimals. */
export const fmt = (n: number, digits: 0 | 1 = 0) => (digits ? fmt1 : fmt0).format(n || 0);

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "2026-10-19" -> "19 Oct" (dates are UTC calendar days). */
export const shortDate = (iso: string) => dateFormat.format(utc(iso));

/** ISO-8601 week number. */
export function isoWeek(iso: string): number {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
