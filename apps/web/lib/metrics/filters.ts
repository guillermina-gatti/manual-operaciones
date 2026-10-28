// Filters of the metrics panel (HU38). They live in the address (?area=…&desde=…&hasta=…), so
// a filtered view can be shared and "back" works. Without dates, the last 30 days.
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import type { Area } from '@/lib/directory';

export const DEFAULT_PERIOD_DAYS = 30;
export const METRICS_PATH = '/metricas';

export interface PanelFilters {
  areaId: string | null;
  from: string; // "YYYY-MM-DD", inclusive
  to: string; // "YYYY-MM-DD", inclusive
}

export interface AreaOption {
  value: string; // '' means no area filter
  label: string;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

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

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS).toISOString().slice(0, 10);
}

// The last 30 days, today included.
export function defaultPeriod(today: string): { from: string; to: string } {
  return { from: addDays(today, -(DEFAULT_PERIOD_DAYS - 1)), to: today };
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

// ADMIN: "Todas" and every area. SUPERVISOR: "Todas mis áreas" and only theirs (filterable,
// from the last answer of the API; unknown while it loads). The selected area always stays
// in the list, so the selector never shows a value it does not have.
export function areaOptions(
  isAdmin: boolean,
  areas: Area[],
  filterable: string[] | null | undefined,
  selected: string | null,
): AreaOption[] {
  const visible = isAdmin
    ? areas
    : areas.filter((area) => filterable?.includes(area.id) || area.id === selected);
  const options = visible.map((area) => ({ value: area.id, label: area.name }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: 'Área elegida' });
  }
  return [{ value: '', label: isAdmin ? 'Todas' : 'Todas mis áreas' }, ...options];
}
