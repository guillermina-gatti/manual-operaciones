// Formats for the metrics panel: percentages and counts, in Argentine Spanish.
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
