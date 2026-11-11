// "Tus procedimientos recientes": each procedure the employee started in the period, the most
// recently started first (the order of the API). Their counts, their average time and the step
// that takes them longest in the latest version they ran. Only their executions.
import { useId } from 'react';
import { CARD } from '@/components/documents/design';
import type { MyProcedureMetrics } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatLastActivity, staleLabel } from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';

interface RecentProceduresTableProps {
  procedures: MyProcedureMetrics[];
  staleAfterHours: number;
  // Area id → name, with "(inactiva)" if it applies; an unknown id is not shown.
  areaNames: ReadonlyMap<string, string>;
}

const HEAD = 'px-4 py-3 text-left text-sm font-semibold text-texto-suave';
const CELL = 'px-4 py-3 align-middle';
const NUMBER = `${CELL} text-right tabular-nums`;

export function RecentProceduresTable({
  procedures,
  staleAfterHours,
  areaNames,
}: RecentProceduresTableProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-bold text-texto">
          Tus procedimientos recientes
        </h2>
        <p className="text-texto-suave">
          Los que empezaste en el período, del más reciente al más viejo.
        </p>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {/* Wide tables scroll inside their card; the page never scrolls sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-texto">
            <caption className="sr-only">Tus procedimientos recientes</caption>
            <thead className="bg-fondo">
              <tr>
                <th scope="col" className={HEAD}>
                  Procedimiento
                </th>
                <th scope="col" className={`${HEAD} text-right`}>
                  Empezadas
                </th>
                <th scope="col" className={`${HEAD} text-right`}>
                  Completadas
                </th>
                <th scope="col" className={`${HEAD} text-right`}>
                  {staleLabel(staleAfterHours)}
                </th>
                <th scope="col" className={HEAD}>
                  Tu tiempo medio
                </th>
                <th scope="col" className={HEAD}>
                  Paso que más te lleva
                </th>
                <th scope="col" className={HEAD}>
                  Última vez
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {procedures.map((procedure) => {
                const areas = procedure.areaIds.flatMap((id) => areaNames.get(id) ?? []);
                return (
                  <tr key={procedure.procedureId}>
                    <th scope="row" className={`${CELL} text-left font-normal`}>
                      <span className="block font-bold">
                        {metricsProcedureName(procedure.procedureId, procedure.title)}
                      </span>
                      {areas.length > 0 && (
                        <span className="block text-sm text-texto-suave">{areas.join(', ')}</span>
                      )}
                    </th>
                    <td className={NUMBER}>{formatCount(procedure.started)}</td>
                    <td className={NUMBER}>{formatCount(procedure.completed)}</td>
                    <td className={NUMBER}>{formatCount(procedure.abandoned)}</td>
                    <td className={`${CELL} font-bold tabular-nums whitespace-nowrap`}>
                      {formatDuration(procedure.avgCompletionMs)}
                    </td>
                    <td className={CELL}>
                      {procedure.slowestStep ? (
                        <>
                          Paso {procedure.slowestStep.order}: {procedure.slowestStep.title}
                          <span className="whitespace-nowrap text-texto-suave">
                            {' '}
                            · {formatDuration(procedure.slowestStep.avgDurationMs)}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={`${CELL} text-sm whitespace-nowrap tabular-nums`}>
                      {formatLastActivity(procedure.lastStartedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
