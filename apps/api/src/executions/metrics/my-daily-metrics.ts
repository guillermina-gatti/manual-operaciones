/* Daily activity of the employee (GET /metrics/me/daily): the executions they completed
on each of the last 21 days, and the working days of the current week in which they made
progress (the "weekly nest" of Mi actividad). Pure functions: the window comes from the
clock and the company time zone, the rows from the database and the catalog.

- A day is a calendar day of the company (America/Argentina/Buenos_Aires by default),
  never UTC: an execution completed at 23:30 in Buenos Aires is on that day.
- The days count COMPLETED executions by the day they were completed. RESTARTED and
  abandoned ones never are. The area filter applies as in /metrics/me: to the procedures
  currently in the area (or in the viewer's active areas).
- The week is Monday to Friday. On Saturday and Sunday it is the one that just ended.
  Progress on a day = at least one step finished that day in one of their executions
  (not RESTARTED), or an execution completed that day. The week is the whole person's:
  no area filter. */
import type { CatalogProcedureVersion } from '../ports/procedures-catalog';
import { addDays, companyDate, toMetricsPeriod } from './metrics-period';

// The days of the chart, today included.
export const DAILY_WINDOW_DAYS = 21;

// [from, to): from inclusive, to exclusive.
export interface Instants {
  from: Date;
  to: Date;
}

// What the repository is asked for. Every limit is the start of a company day.
export interface DailyWindow {
  timeZone: string;
  // The completed executions of the 21 days.
  completed: Instants;
  // Monday to Friday of the week: the days with progress.
  progress: Instants;
  // Monday to Sunday of the week: how many executions were completed.
  week: Instants;
}

export interface DailyPlan {
  // The 21 days, ascending, the last one today.
  days: string[];
  // Monday and Friday of the week of the nest.
  week: { from: string; to: string };
  window: DailyWindow;
}

// One row per day and version: how many executions of the user were completed that day.
export interface DailyCompletion {
  day: string; // "YYYY-MM-DD" in the company time zone
  procedureId: string;
  procedureVersionId: string;
  completed: number;
  lastCompletedAt: Date;
}

export interface DailyAggregates {
  completions: DailyCompletion[];
  // The working days of the week with progress, "YYYY-MM-DD", any order.
  progressDays: string[];
  // Executions completed from Monday to Sunday, every area.
  weekCompleted: number;
}

export interface DailyProcedure {
  procedureId: string;
  title: string | null; // as in the other metrics
  completed: number;
}

export interface DailyDay {
  date: string;
  procedures: DailyProcedure[];
}

export interface DailyWeek {
  from: string;
  to: string;
  activeDays: string[];
  completedCount: number;
}

// 0 is Sunday, as Date#getUTCDay.
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Monday of the week of the nest: this one from Monday to Friday, the one that just
// ended on Saturday and Sunday.
export function nestMonday(today: string): string {
  const weekday = weekdayOf(today);
  if (weekday === 6) return addDays(today, -5);
  if (weekday === 0) return addDays(today, -6);
  return addDays(today, 1 - weekday);
}

// The days and the instants of the request, from now and the company time zone.
export function dailyPlan(now: Date, timeZone: string): DailyPlan {
  const today = companyDate(now, timeZone);
  const days = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) =>
    addDays(today, i - (DAILY_WINDOW_DAYS - 1)),
  );
  const monday = nestMonday(today);
  const friday = addDays(monday, 4);
  const sunday = addDays(monday, 6);
  // Both days inclusive: [start of the first, start of the day after the last).
  const instants = (from: string, to: string): Instants => {
    const period = toMetricsPeriod(from, to, timeZone);
    return { from: period.from!, to: period.to! };
  };
  return {
    days,
    week: { from: monday, to: friday },
    window: {
      timeZone,
      completed: instants(days[0], today),
      progress: instants(monday, friday),
      week: instants(monday, sunday),
    },
  };
}

// Every day of the window, also the empty ones. On each day, one entry per procedure of
// a visible version (the area filter), the most completed first, then by title. The
// title is that of the version completed last in the window.
export function buildDailyDays(
  days: string[],
  completions: DailyCompletion[],
  versions: ReadonlyMap<string, CatalogProcedureVersion>,
): DailyDay[] {
  const visible = completions.filter((c) => versions.has(c.procedureVersionId));

  const titles = new Map<string, { at: Date; title: string | null }>();
  for (const row of visible) {
    const current = titles.get(row.procedureId);
    if (!current || row.lastCompletedAt > current.at) {
      const title = versions.get(row.procedureVersionId)?.title;
      titles.set(row.procedureId, {
        at: row.lastCompletedAt,
        title: title?.trim() ? title : null,
      });
    }
  }

  const byDay = new Map<string, Map<string, number>>();
  for (const row of visible) {
    const day = byDay.get(row.day) ?? new Map<string, number>();
    day.set(row.procedureId, (day.get(row.procedureId) ?? 0) + row.completed);
    byDay.set(row.day, day);
  }

  return days.map((date) => ({
    date,
    procedures: [...(byDay.get(date) ?? new Map<string, number>())]
      .map(([procedureId, completed]) => ({
        procedureId,
        title: titles.get(procedureId)?.title ?? null,
        completed,
      }))
      .sort(
        (a, b) =>
          b.completed - a.completed ||
          (a.title ?? '').localeCompare(b.title ?? '', 'es') ||
          a.procedureId.localeCompare(b.procedureId),
      ),
  }));
}

// Only Monday to Friday of the week, without repeats, ascending.
export function buildDailyWeek(
  plan: DailyPlan,
  aggregates: Pick<DailyAggregates, 'progressDays' | 'weekCompleted'>,
): DailyWeek {
  const { from, to } = plan.week;
  return {
    from,
    to,
    activeDays: [...new Set(aggregates.progressDays)]
      .filter((day) => day >= from && day <= to)
      .sort(),
    completedCount: aggregates.weekCompleted,
  };
}
