// Formats for the metrics panel: percentages, counts and days, in Argentine Spanish.
const MISSING = '—';

const countFormat = new Intl.NumberFormat('es-AR');

// 0.25 → "25 %", 1/3 → "33 %". null (nothing to divide) → "—". Built by hand: Intl's percent
// style puts the space before "%" in some runtimes and not in others. The space does not break.
export function formatPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return MISSING;
  return `${countFormat.format(Math.round(rate * 100))} %`;
}

// 1284 → "1.284".
export function formatCount(value: number): string {
  return countFormat.format(value);
}

// Abbreviated in lowercase, as the design asks ("4 nov 2026"). Written by hand: Intl adds a dot
// ("nov.") in some runtimes and not in others.
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "2026-11-04" → "4 nov 2026". Something that is not a "YYYY-MM-DD" day → "—".
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return MISSING;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

// "1 nov 2026 – 4 nov 2026", or a single day when both are the same.
export function formatPeriod(from: string, to: string): string {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}
