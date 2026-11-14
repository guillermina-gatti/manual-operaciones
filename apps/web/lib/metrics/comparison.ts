// "Resumen general" against the period before (HU38): the period of the same length right before
// the one in view, and how each number of the summary changed. Pure: the panel asks the API for the
// previous period and the hero draws the texts.
//
// The words always carry the change, with an arrow: "▲ 3 más que el período anterior", "▼ 2 puntos
// de completadas menos", "▲ 4 min más lento", "= igual". Going up or down is information, not good or
// bad; only the abandoned and the time say when they got worse (worse: true), so the hero can add a
// small dot next to the words.
import type { ExecutionCounts } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatCount } from './format';
import type { Period } from './filters';

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(day: string): number | null {
  const match = CALENDAR_DATE.exec(day);
  if (!match) return null;
  const [year, month, date] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, date);
  return new Date(time).getUTCDate() === date ? time : null;
}

const toDay = (time: number) => new Date(time).toISOString().slice(0, 10);

// From 1 to 13 November (13 days) → 19 to 31 October; one day → the day before. Calendar days in
// UTC, so no daylight saving or time zone moves a day. Without both dates, or with them backwards,
// there is nothing to compare: null.
export function previousPeriod(from: string | null, to: string | null): Period | null {
  if (!from || !to) return null;
  const start = toUtc(from);
  const end = toUtc(to);
  if (start === null || end === null || start > end) return null;
  const days = Math.round((end - start) / DAY_MS) + 1;
  const previousEnd = start - DAY_MS;
  return { from: toDay(previousEnd - (days - 1) * DAY_MS), to: toDay(previousEnd) };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDay(day: string, withYear: boolean): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[month - 1]}${withYear ? ` ${year}` : ''}`;
}

// "19 oct – 31 oct"; one day, "12 nov"; across two years, with them: "20 dic 2025 – 3 ene 2026".
export function comparedPeriodLabel({ from, to }: Period): string {
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  return from === to
    ? shortDay(from, false)
    : `${shortDay(from, withYear)} – ${shortDay(to, withYear)}`;
}

export type Direction = 'up' | 'down' | 'same' | 'none';

export interface Change {
  direction: Direction;
  // With its arrow ("▲", "▼" or "="); without one when there is nothing to compare.
  text: string;
  // The same words without the arrow, for the screen: the arrow is drawn apart, hidden from a
  // screen reader, since the words already say más or menos.
  words: string;
  // Fewer words for the narrow columns of the phone, right under the name of the datum, which says
  // the rest ("Abandonadas" · "▲ 2 más"). The same as words when there is nothing to cut.
  short: string;
  // More abandoned or slower.
  worse: boolean;
}

export type SummaryComparison =
  // The previous period had no executions: nothing to compare, and nothing divided by 0.
  | { kind: 'empty' }
  | {
      kind: 'compared';
      started: Change;
      completedRate: Change;
      abandoned: Change;
      avgCompletion: Change;
    };

export interface ComparedTotals extends ExecutionCounts {
  avgCompletionMs: number | null;
}

export const ARROW = { up: '▲', down: '▼', same: '=', none: '' } as const;

function change(direction: Direction, words: string, worse = false, short = words): Change {
  return {
    direction,
    text: direction === 'none' ? words : `${ARROW[direction]} ${words}`,
    words,
    short,
    worse,
  };
}

const directionOf = (difference: number): Direction =>
  difference > 0 ? 'up' : difference < 0 ? 'down' : 'same';

const pointsFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

// more and less take the amount: "3 más que el período anterior", "1 abandonada menos".
function countChange(
  current: number,
  previous: number,
  more: (amount: number) => string,
  less: (amount: number) => string,
): Change {
  const difference = current - previous;
  const direction = directionOf(difference);
  if (direction === 'same') return change('same', 'igual');
  const amount = Math.abs(difference);
  const up = direction === 'up';
  const words = `${formatCount(amount)} ${up ? more(amount) : less(amount)}`;
  return change(direction, words, false, `${formatCount(amount)} ${up ? 'más' : 'menos'}`);
}

const abandonedWord = (amount: number) => (amount === 1 ? 'abandonada' : 'abandonadas');
const rateOf = ({ completed, started }: ExecutionCounts) =>
  started === 0 ? 0 : (completed / started) * 100;

// The % completed, in points, with one decimal at most: 80 % → 82,5 % is "2,5 puntos". With 0
// executions the rate counts as 0, never a division by 0.
function rateChange(current: ExecutionCounts, previous: ExecutionCounts): Change {
  const points = Math.round((rateOf(current) - rateOf(previous)) * 10) / 10;
  const direction = directionOf(points);
  if (direction === 'same') return change('same', 'igual');
  const amount = Math.abs(points);
  const unit = amount === 1 ? 'punto' : 'puntos';
  return change(
    direction,
    `${pointsFormat.format(amount)} ${unit} de completadas ${direction === 'up' ? 'más' : 'menos'}`,
  );
}

// In whole seconds, as the hero writes the time. Without a time on either side, it says why.
function timeChange(current: number | null, previous: number | null): Change {
  if (current === null) return change('none', 'Sin completadas para comparar');
  if (previous === null) return change('none', 'Sin completadas en el período anterior');
  const difference = Math.round(current / 1000) - Math.round(previous / 1000);
  const direction = directionOf(difference);
  if (direction === 'same') return change('same', 'igual');
  const amount = formatDuration(Math.abs(difference) * 1000);
  return direction === 'up'
    ? change('up', `${amount} más lento`, true)
    : change('down', `${amount} más rápido`);
}

// When the previous period had no executions there are no differences to tell: from 0, any
// change would be a made-up percent.
export function compareSummary(
  current: ComparedTotals,
  previous: ComparedTotals,
): SummaryComparison {
  if (previous.started === 0) return { kind: 'empty' };
  const abandoned = countChange(
    current.abandoned,
    previous.abandoned,
    (amount) => `${abandonedWord(amount)} más`,
    (amount) => `${abandonedWord(amount)} menos`,
  );
  return {
    kind: 'compared',
    started: countChange(
      current.started,
      previous.started,
      () => 'más que el período anterior',
      () => 'menos que el período anterior',
    ),
    completedRate: rateChange(current, previous),
    abandoned: { ...abandoned, worse: abandoned.direction === 'up' },
    avgCompletion: timeChange(current.avgCompletionMs, previous.avgCompletionMs),
  };
}
