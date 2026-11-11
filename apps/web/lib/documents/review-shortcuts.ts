// Atajos de la fecha de revisión en la carga: hoy en Buenos Aires + 3 meses, 6 meses o 1 año, y la
// fecha en palabras para mostrar debajo. Todo con fechas YYYY-MM-DD, sin horas, así no se corre un día.
import { COMPANY_TIME_ZONE } from './format';

export type ReviewShortcut = 3 | 6 | 12;

export const REVIEW_SHORTCUTS: { months: ReviewShortcut; label: string }[] = [
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 año' },
];

// Hoy en la zona de la empresa, como YYYY-MM-DD (en-CA escribe así las fechas).
export function todayIn(now: Date, timeZone: string = COMPANY_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Suma meses a un día. Si el día no existe en el mes de destino, el último del mes:
// 2026-11-30 + 3 → 2027-02-28; 2027-11-29 + 3 → 2028-02-29 (bisiesto).
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

// La fecha de un atajo: hoy en Buenos Aires + N meses.
export function shortcutDate(months: ReviewShortcut, now: Date): string {
  return addMonths(todayIn(now), months);
}

// El atajo que corresponde a una fecha, o null si es otra (escrita a mano o vacía).
export function shortcutFor(value: string, now: Date): ReviewShortcut | null {
  return REVIEW_SHORTCUTS.find(({ months }) => shortcutDate(months, now) === value)?.months ?? null;
}

const longDate = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// "2027-05-06" → "6 de mayo de 2027"; null si no es una fecha YYYY-MM-DD que exista.
export function formatLongDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return longDate.format(date);
}
