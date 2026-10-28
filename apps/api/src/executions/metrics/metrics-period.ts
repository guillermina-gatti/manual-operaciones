/* The period of the metrics (HU38): calendar days of the company turned into instants */

export const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// An execution in progress whose current step started more than this long ago counts
// as abandoned at that step. Fixed for the MVP.
export const STALE_AFTER_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// [from, to): from is inclusive and to exclusive. null means no limit on that side.
export interface MetricsPeriod {
  from: Date | null;
  to: Date | null;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "YYYY-MM-DD" and a day that exists (2026-02-30 does not).
export function isCalendarDate(text: string): boolean {
  const match = CALENDAR_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Both days are inclusive: "to" covers its whole day, so the period ends at the start
// of the next one. Days are the company's (timeZone), not UTC.
export function toMetricsPeriod(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): MetricsPeriod {
  return {
    from: from ? startOfDay(from, timeZone) : null,
    to: to ? startOfDay(nextDay(to), timeZone) : null,
  };
}

// The instant before which a step still running counts as abandoned.
export function staleBefore(now: Date): Date {
  return new Date(now.getTime() - STALE_AFTER_HOURS * HOUR_MS);
}

function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// The first instant of the day in the time zone. Usually midnight; on a day that
// starts with a daylight saving jump, the first hour that exists. Two candidates come
// from the offset before and after a possible change; the earliest one that falls on
// the requested day wins.
function startOfDay(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const midnightUtc = Date.UTC(year, month - 1, day);
  const first = midnightUtc - offsetMs(midnightUtc, timeZone);
  const second = midnightUtc - offsetMs(first, timeZone);
  const onDay = [first, second].filter(
    (instant) => localDate(instant, timeZone) === date,
  );
  return new Date(Math.min(...(onDay.length > 0 ? onDay : [second])));
}

// "YYYY-MM-DD" of the instant on the wall clock of the time zone.
function localDate(instant: number, timeZone: string): string {
  return new Date(instant + offsetMs(instant, timeZone))
    .toISOString()
    .slice(0, 10);
}

// How far the wall clock of the time zone is from UTC at that instant.
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}
