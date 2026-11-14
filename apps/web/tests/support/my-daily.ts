// Answers of GET /api/metrics/me/daily for the tests of the weekly nest and the daily chart.
import type { MyDailyActivityResponse, MyDailyDay, MyDailyProcedure } from '@/lib/api';

// "YYYY-MM-DD" n days later, in UTC.
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// The 21 days up to `today`, all empty unless `byDay` gives their procedures.
export function dailyDays(
  today: string,
  byDay: Record<string, MyDailyProcedure[]> = {},
): MyDailyDay[] {
  return Array.from({ length: 21 }, (_, i) => {
    const date = addDays(today, i - 20);
    return { date, procedures: byDay[date] ?? [] };
  });
}

export const procedure = (
  index: number,
  completed: number,
  title: string | null = `Procedimiento ${index}`,
): MyDailyProcedure => ({
  procedureId: `1a000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title,
  completed,
});

// Thursday 12 November 2026: the week of 9 – 13 Nov, with progress on Monday, Tuesday and Wednesday.
export function myDailyResponse(
  overrides: Omit<Partial<MyDailyActivityResponse>, 'week'> & {
    week?: Partial<MyDailyActivityResponse['week']>;
  } = {},
): MyDailyActivityResponse {
  const today = overrides.windowTo ?? '2026-11-12';
  const { week, ...rest } = overrides;
  return {
    windowFrom: addDays(today, -20),
    windowTo: today,
    days: dailyDays(today),
    ...rest,
    week: {
      from: '2026-11-09',
      to: '2026-11-13',
      activeDays: ['2026-11-09', '2026-11-10', '2026-11-11'],
      completedCount: 4,
      ...week,
    },
  };
}
