// The employee's own activity (/ejecuciones/mi-actividad): only their executions, with the same
// filters as /metricas, which live in the address.
import type { DocumentReference, MyProcedureMetrics } from '@/lib/api';
import type { Area } from '@/lib/directory/areas-directory';
import { todayInCompany } from '@/lib/metrics/filters';
import { formatCount, formatDay, formatPercent } from '@/lib/metrics/format';
import { formatTime } from './format';

export const MY_ACTIVITY_PATH = '/ejecuciones/mi-actividad';

// The "Para retomar" section of that page, with every execution in progress. The picker of
// /ejecuciones shows only the latest one and links here for the rest.
export const RESUME_SECTION_ID = 'para-retomar';
export const RESUME_SECTION_HREF = `${MY_ACTIVITY_PATH}#${RESUME_SECTION_ID}`;

// "Sin avanzar hace más de 24 h": what the API counts as abandoned, said as what it is. The
// execution is not closed; the employee can still resume it.
export const staleLabel = (staleAfterHours: number) =>
  `Sin avanzar hace más de ${staleAfterHours} h`;

// "27 oct 2026, 10:05", in the company's time zone. Something that is not a date → "—".
export function formatLastActivity(value: string): string {
  const parts = lastActivityParts(value);
  return parts ? `${parts.day}, ${parts.time}` : '—';
}

// The same, in two pieces: the table shows the day above and the time below. null if it is not a date.
export function lastActivityParts(value: string): { day: string; time: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { day: formatDay(todayInCompany(date)), time: formatTime(value) };
}

// --- "Tu resumen" ----------------------------------------------------------------------------------

// The period of the summary, short: "1 nov – 13 nov". The year only when the two dates are not in
// the same one ("20 dic 2026 – 5 ene 2027"); a single day when both are the same.
export function formatShortPeriod(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const day = (value: string) => {
    const full = formatDay(value);
    return sameYear ? full.replace(/ \d{4}$/, '') : full;
  };
  return from === to ? day(from) : `${day(from)} – ${day(to)}`;
}

// "Terminaste 25 de los 27 recorridos que empezaste"; with one, "Terminaste 0 de 1 recorrido que
// empezaste". Without any started, the summary shows its empty state instead.
export function summaryHeadline(completed: number, started: number): string {
  return started === 1
    ? `Terminaste ${formatCount(completed)} de 1 recorrido que empezaste`
    : `Terminaste ${formatCount(completed)} de los ${formatCount(started)} recorridos que empezaste`;
}

// The share as the ring says it: 0.926 → "92,6 %". null (nothing started) → "—".
export function completedPercentLabel(share: number | null): string {
  return formatPercent(share).replace(/%$/, ' %');
}

// The words of the legend: "1 completada", "3 completadas", "2 en curso", "1 sin avanzar".
export const completedLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'completada' : 'completadas'}`;
export const inProgressLabel = (count: number) => `${formatCount(count)} en curso`;
export const staleCountLabel = (count: number) => `${formatCount(count)} sin avanzar`;

// The width of each part of a bar, in %: completed of started. 0 when nothing was started.
export function shareOf(part: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (part / total) * 100)) : 0;
}

// "21 min 30 s" → [{ value: '21', unit: 'min' }, { value: '30', unit: 's' }], so the unit can go
// smaller than the number. "—" (no time) → [].
export function durationParts(text: string): { value: string; unit: string }[] {
  return [...text.matchAll(/(\d+) (\S+)/g)].map(([, value, unit]) => ({ value, unit }));
}

// The areas of each procedure for the "Para retomar" cards: "resume" does not bring them, so they
// come from the procedures of the period (areaIds) and the names of the directory. A procedure not
// run in the period, or an area the directory does not know, simply has no chip.
export function areasByProcedure(
  procedures: readonly MyProcedureMetrics[],
  areas: readonly Area[],
): Map<string, DocumentReference[]> {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const map = new Map<string, DocumentReference[]>();
  for (const procedure of procedures) {
    const known = procedure.areaIds.flatMap((id) => {
      const area = byId.get(id);
      return area ? [{ id: area.id, name: area.name, isActive: area.isActive }] : [];
    });
    if (known.length > 0) map.set(procedure.procedureId, known);
  }
  return map;
}
