// The employee's own activity (/ejecuciones/mi-actividad): only their executions, with the same
// filters as /metricas, which live in the address.
import type { DocumentReference, MyProcedureMetrics } from '@/lib/api';
import type { Area } from '@/lib/directory/areas-directory';
import { todayInCompany } from '@/lib/metrics/filters';
import { formatDay } from '@/lib/metrics/format';
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDay(todayInCompany(date))}, ${formatTime(value)}`;
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
