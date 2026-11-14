// The daily activity chart of Mi actividad: executions completed per day, stacked by procedure,
// for the 21 days of GET /metrics/me/daily. Pure functions: which procedures get a color, the scale
// of the y axis and the words of the axis, the box and the screen reader.
import type { MyDailyDay } from '@/lib/api';
import { formatCount, formatDay } from '@/lib/metrics/format';

// The colors in order: the procedures with the most completed executions in the window.
export const SERIES_COLORS = [
  'var(--color-naranja)',
  'var(--color-bosque)',
  '#EDA100',
  '#1BAF7A',
] as const;
// The rest, together: the darkest mud of the nest.
export const OTHERS_COLOR = '#9A6A45';
export const OTHERS_KEY = 'otros';

export interface ChartSeries {
  key: string; // the procedureId, or OTHERS_KEY
  label: string;
  color: string;
  procedureIds: string[];
  total: number;
}

const UNTITLED = 'Procedimiento sin nombre';
const nameOf = (title: string | null | undefined) => (title?.trim() ? title.trim() : UNTITLED);

// Every procedure of the window with its total, the most completed first; on a tie, by name.
export function procedureTotals(days: readonly MyDailyDay[]) {
  const totals = new Map<string, { procedureId: string; name: string; total: number }>();
  for (const day of days) {
    for (const procedure of day.procedures) {
      const current = totals.get(procedure.procedureId);
      totals.set(procedure.procedureId, {
        procedureId: procedure.procedureId,
        name: current?.name ?? nameOf(procedure.title),
        total: (current?.total ?? 0) + procedure.completed,
      });
    }
  }
  return [...totals.values()].sort(
    (a, b) =>
      b.total - a.total ||
      a.name.localeCompare(b.name, 'es') ||
      a.procedureId.localeCompare(b.procedureId),
  );
}

// The four procedures with the most completed executions keep their own color, in that order. The
// rest fold into "Otros N procedimientos"; a single one left keeps its name (in the same mud).
// The order of the series is also the order of the stack, from the bottom up.
export function chartSeries(days: readonly MyDailyDay[]): ChartSeries[] {
  const totals = procedureTotals(days);
  const own = totals.slice(0, SERIES_COLORS.length).map(
    (procedure, index): ChartSeries => ({
      key: procedure.procedureId,
      label: procedure.name,
      color: SERIES_COLORS[index],
      procedureIds: [procedure.procedureId],
      total: procedure.total,
    }),
  );
  const rest = totals.slice(SERIES_COLORS.length);
  if (rest.length === 0) return own;
  return [
    ...own,
    {
      key: OTHERS_KEY,
      label: rest.length === 1 ? rest[0].name : `Otros ${formatCount(rest.length)} procedimientos`,
      color: OTHERS_COLOR,
      procedureIds: rest.map((procedure) => procedure.procedureId),
      total: rest.reduce((sum, procedure) => sum + procedure.total, 0),
    },
  ];
}

export interface DayDetail {
  procedureId: string;
  name: string;
  completed: number;
  color: string;
}

export interface ChartDay {
  date: string;
  total: number;
  // One per series, in the order of the series (the bottom one first); 0 when it has none.
  segments: { key: string; color: string; count: number }[];
  // Every procedure of the day, the most completed first, with the color of its series.
  details: DayDetail[];
}

export function chartDays(days: readonly MyDailyDay[], series: readonly ChartSeries[]): ChartDay[] {
  const seriesOf = new Map<string, ChartSeries>();
  for (const item of series) for (const id of item.procedureIds) seriesOf.set(id, item);
  return days.map((day) => {
    const details = day.procedures
      .filter((procedure) => procedure.completed > 0)
      .map((procedure) => ({
        procedureId: procedure.procedureId,
        name: nameOf(procedure.title),
        completed: procedure.completed,
        color: seriesOf.get(procedure.procedureId)?.color ?? OTHERS_COLOR,
      }))
      .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, 'es'));
    const segments = series.map((item) => ({
      key: item.key,
      color: item.color,
      count: details
        .filter((detail) => item.procedureIds.includes(detail.procedureId))
        .reduce((sum, detail) => sum + detail.completed, 0),
    }));
    return {
      date: day.date,
      total: details.reduce((sum, detail) => sum + detail.completed, 0),
      segments,
      details,
    };
  });
}

// The y axis: whole numbers from 0 to a round top that is at least 4, with at most 5 marks.
export function yScale(max: number): { top: number; ticks: number[] } {
  const target = Math.max(4, Math.ceil(max));
  let step = 1;
  for (const base of [1, 2, 5]) {
    step = base;
    if (Math.ceil(target / step) <= 4) break;
  }
  for (let magnitude = 10; Math.ceil(target / step) > 4; magnitude *= 10) {
    for (const base of [1, 2, 2.5, 5]) {
      step = base * magnitude;
      if (Math.ceil(target / step) <= 4) break;
    }
  }
  const top = Math.ceil(target / step) * step;
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const parts = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return { weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), month, day };
};
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "24 oct": the labels of the x axis.
export const axisDay = (date: string) => formatDay(date).replace(/ \d{4}$/, '');

// Which days of the x axis carry a label: every 2 on a computer, every 3 on a phone.
export const showsAxisLabel = (index: number, every: number) => index % every === 0;

export const completedLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'completada' : 'completadas'}`;

// The title of the box: "Martes 3 nov · 3 completadas".
export function dayBoxTitle(day: ChartDay): string {
  const { weekday } = parts(day.date);
  return `${capitalize(WEEKDAYS[weekday])} ${axisDay(day.date)} · ${completedLabel(day.total)}`;
}

// What a screen reader says of a day: "martes 3 de noviembre: 3 completadas — Hola2 1, Hola1 1".
export function dayAriaLabel(day: ChartDay): string {
  const { weekday, month, day: number } = parts(day.date);
  const head = `${WEEKDAYS[weekday]} ${number} de ${MONTHS[month - 1]}: ${completedLabel(day.total)}`;
  if (day.details.length === 0) return head;
  return `${head} — ${day.details.map((d) => `${d.name} ${formatCount(d.completed)}`).join(', ')}`;
}

// The full day for the rows of the table: "Martes 3 nov".
export function tableDay(date: string): string {
  return `${capitalize(WEEKDAYS[parts(date).weekday])} ${axisDay(date)}`;
}
