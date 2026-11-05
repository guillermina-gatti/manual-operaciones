// Filters of the metrics panel (HU38). They live in the address (?area=…&desde=…&hasta=…), so
// a filtered view can be shared and "back" works. Without dates, this month up to today.
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import { displayAreaName } from '@/lib/directory/areas-directory';
import type { Area } from '@/lib/directory';

export const METRICS_PATH = '/metricas';

export interface PanelFilters {
  areaId: string | null;
  from: string; // "YYYY-MM-DD", inclusive
  to: string; // "YYYY-MM-DD", inclusive
}

export interface AreaOption {
  value: string; // '' means no area filter
  label: string;
  // Gray text on the right: "12 áreas" for the first option, "3 procedimientos" or "Sin datos"
  // for an area. Missing when it is not known.
  hint?: string;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// en-CA formats dates as YYYY-MM-DD.
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMPANY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// "YYYY-MM-DD" and a day that exists (2026-02-30 does not).
export function isCalendarDate(text: string): boolean {
  const match = CALENDAR_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

// Today in the company, not in the browser's time zone.
export function todayInCompany(now: Date = new Date()): string {
  return dayFormat.format(now);
}

export interface Period {
  from: string;
  to: string;
}

// The same day n months before or after; a day the month does not have becomes its last one
// (31/05 minus 3 months is 28/02).
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

// The quick periods of the panel, always up to today.
export type QuickPeriod = 'today' | 'month' | 'quarter';

export const QUICK_PERIODS: readonly { id: QuickPeriod; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Últimos 3 meses' },
];

export function quickPeriodRange(period: QuickPeriod, today: string): Period {
  if (period === 'today') return { from: today, to: today };
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: addMonths(today, -3), to: today };
}

// The quick period that gives exactly these dates, or null if they were changed by hand. On
// the 1st of the month "Este mes" and "Hoy" are the same range: "Este mes" wins, as the default.
export function matchingQuickPeriod(from: string, to: string, today: string): QuickPeriod | null {
  const order: QuickPeriod[] = ['month', 'today', 'quarter'];
  return (
    order.find((period) => {
      const range = quickPeriodRange(period, today);
      return range.from === from && range.to === to;
    }) ?? null
  );
}

// Without dates in the address: this month, today included.
export function defaultPeriod(today: string): Period {
  return quickPeriodRange('month', today);
}

// A value written by hand that is not valid is ignored: the default takes its place.
export function parseMetricsFilters(params: SearchParamsLike, today: string): PanelFilters {
  const fallback = defaultPeriod(today);
  const area = params.get('area');
  const from = params.get('desde');
  const to = params.get('hasta');
  return {
    areaId: area && UUID.test(area) ? area : null,
    from: from && isCalendarDate(from) ? from : fallback.from,
    to: to && isCalendarDate(to) ? to : fallback.to,
  };
}

export function metricsHref({ areaId, from, to }: PanelFilters): string {
  const params = new URLSearchParams();
  if (areaId) params.set('area', areaId);
  params.set('desde', from);
  params.set('hasta', to);
  return `${METRICS_PATH}?${params.toString()}`;
}

// ADMIN: "Todas las áreas" and every area. SUPERVISOR: "Todas mis áreas" and only theirs (filterable,
// from the last answer of the API; unknown while it loads). The selected area always stays
// in the list, so the selector never shows a value it does not have. An inactive area keeps
// its "(inactiva)" label, as everywhere else.
export function areaOptions(
  isAdmin: boolean,
  areas: Area[],
  filterable: string[] | null | undefined,
  selected: string | null,
): AreaOption[] {
  const visible = isAdmin
    ? areas
    : areas.filter((area) => filterable?.includes(area.id) || area.id === selected);
  const options = visible.map((area) => ({ value: area.id, label: displayAreaName(area) }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: 'Área elegida' });
  }
  return [{ value: '', label: isAdmin ? 'Todas las áreas' : 'Todas mis áreas' }, ...options];
}

// How many procedures with executions each area has. Only meaningful for an answer without an
// area filter: with one, the other areas are not in it. A procedure with two areas counts in each
// of them, as it is shown in both.
export function proceduresPerArea(procedures: { areaIds: string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const procedure of procedures) {
    for (const areaId of new Set(procedure.areaIds)) {
      counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
    }
  }
  return counts;
}

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

// The gray hints of the selector. The first option says how many areas there are (nothing if
// none is known yet); each area, how many procedures it has in the period, or nothing while that
// is not known (counts null).
export function withAreaHints(
  options: AreaOption[],
  counts: ReadonlyMap<string, number> | null,
): AreaOption[] {
  const areaCount = options.filter((option) => option.value !== '').length;
  return options.map((option) => {
    if (option.value === '') {
      return areaCount === 0 ? option : { ...option, hint: plural(areaCount, 'área', 'áreas') };
    }
    if (!counts) return option;
    const count = counts.get(option.value) ?? 0;
    return {
      ...option,
      hint: count === 0 ? 'Sin datos' : plural(count, 'procedimiento', 'procedimientos'),
    };
  });
}

// Without case or accents, by any part of the name: "operac" and "OPERACIÓN" find "Operaciones".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function matchesAreaSearch(label: string, search: string): boolean {
  return fold(label).includes(fold(search.trim()));
}
