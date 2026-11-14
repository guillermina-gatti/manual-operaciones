// The weekly nest of Mi actividad: one layer for each working day of the week (Monday to Friday)
// with progress. The week and its days come from GET /metrics/me/daily; the words are decided
// here. No streaks, no losses, no comparing with anyone: only what the person did this week.
import { formatCount, formatDay } from '@/lib/metrics/format';

export const NEST_DAYS = 5;

const SHORT_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'] as const;
const LONG_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const;

// "YYYY-MM-DD" n days later, counted in UTC so the time zone of the browser does not matter.
function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// "9 nov 2026" → ["9", "NOV"]; null when it is not a date.
function dayAndMonth(day: string): [string, string] | null {
  const parts = formatDay(day).split(' ');
  return parts.length === 3 ? [parts[0], parts[1].toUpperCase()] : null;
}

// "9 – 13 NOV"; across two months "30 NOV – 4 DIC". Empty when a date is missing.
export function weekRangeLabel(from: string, to: string): string {
  const first = dayAndMonth(from);
  const last = dayAndMonth(to);
  if (!first || !last) return '';
  return first[1] === last[1]
    ? `${first[0]} – ${last[0]} ${last[1]}`
    : `${first[0]} ${first[1]} – ${last[0]} ${last[1]}`;
}

// "1 procedimiento", "3 procedimientos".
export const proceduresLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'procedimiento' : 'procedimientos'}`;

// How many working days had progress, between 0 and 5.
export const activeDaysCount = (activeDays: readonly string[]) =>
  Math.min(new Set(activeDays).size, NEST_DAYS);

export function nestTitle(days: number): string {
  if (days <= 0) return 'Tu nido de esta semana está por empezar';
  if (days >= NEST_DAYS) return 'Nido completo';
  return `${days} de ${NEST_DAYS} días con avance`;
}

// The text under the title. With progress (a step finished) but nothing completed yet, it does not
// say "Completaste 0 procedimientos".
export function nestSupportText(days: number, completed: number): string {
  if (days >= NEST_DAYS) return 'Hiciste avance los 5 días de la semana. Buen trabajo.';
  if (completed <= 0 && days <= 0) return 'Completá un procedimiento hoy y sumás la primera franja.';
  const nest = 'Cada día con avance suma una franja a tu nido.';
  if (completed <= 0) return `Todavía no completaste procedimientos esta semana. ${nest}`;
  return `Completaste ${proceduresLabel(completed)} esta semana. ${nest}`;
}

export type NestBadge = 'complete' | 'start' | 'resets';

// On the right: "✓ Semana completa", the button to start, or "Se reinicia el lunes".
export function nestBadge(days: number): NestBadge {
  if (days >= NEST_DAYS) return 'complete';
  if (days <= 0) return 'start';
  return 'resets';
}

// Which day of the week is today (0 = Monday … 4 = Friday); null on Saturday and Sunday, or when
// today is not in that week.
export function todayIndex(today: string, weekFrom: string): number | null {
  for (let index = 0; index < NEST_DAYS; index += 1) {
    if (addDays(weekFrom, index) === today) return index;
  }
  return null;
}

export interface NestDay {
  date: string;
  short: string; // "Lun"
  long: string; // "Lunes"
  active: boolean;
  today: boolean;
  // What a screen reader says: "Lunes: con avance", "Jueves, hoy: sin avance todavía".
  label: string;
}

// The five days, Monday first.
export function nestDays(weekFrom: string, activeDays: readonly string[], today: string): NestDay[] {
  const active = new Set(activeDays);
  const current = todayIndex(today, weekFrom);
  return SHORT_NAMES.map((short, index) => {
    const date = addDays(weekFrom, index);
    const isActive = active.has(date);
    const isToday = index === current;
    const long = LONG_NAMES[index];
    const state = isActive ? 'con avance' : isToday ? 'sin avance todavía' : 'sin avance';
    return {
      date,
      short,
      long,
      active: isActive,
      today: isToday,
      label: `${long}${isToday ? ', hoy' : ''}: ${state}`,
    };
  });
}
