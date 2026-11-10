// "Tiempo por procedimiento": how long a complete execution takes, from start to end, slowest
// first, with the fastest and the slowest completed execution of each procedure.
import { useId } from 'react';
import { CARD } from '@/components/documents/design';
import type { ProcedureMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatCount } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { procedureTimeRows } from '@/lib/metrics/procedure-time';
import { TimeBar } from './FeatherBar';

interface ProcedureTimeTableProps {
  procedures: ProcedureMetricsResponse[];
  // Area id → name, with "(inactiva)" if it applies; an unknown id is not shown.
  areaNames: ReadonlyMap<string, string>;
}

const HEAD = 'px-4 py-3 text-left text-sm font-semibold text-texto-suave';
const CELL = 'px-4 py-3 align-middle';

export function ProcedureTimeTable({ procedures, areaNames }: ProcedureTimeTableProps) {
  const headingId = useId();
  const rows = procedureTimeRows(procedures);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-bold text-texto">
          Tiempo por procedimiento
        </h2>
        <p className="text-texto-suave">
          Cuánto tarda una ejecución completa, de inicio a fin. Ordenado de mayor a menor tiempo
          medio.
        </p>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-texto-suave">
            No hay ejecuciones en este período.
          </p>
        ) : (
          // Wide tables scroll inside their card; the page never scrolls sideways.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-texto">
              <caption className="sr-only">Tiempo por procedimiento</caption>
              <thead className="bg-fondo">
                <tr>
                  <th scope="col" className={HEAD}>
                    Procedimiento
                  </th>
                  <th scope="col" className={`${HEAD} text-right`}>
                    Completadas
                  </th>
                  <th scope="col" className={HEAD}>
                    Tiempo medio total
                  </th>
                  <th scope="col" className={HEAD}>
                    Más rápida
                  </th>
                  <th scope="col" className={HEAD}>
                    Más lenta
                  </th>
                  <th scope="col" className={HEAD}>
                    Paso que más tarda
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {rows.map((row) => {
                  const areas = row.areaIds.flatMap((id) => areaNames.get(id) ?? []);
                  return (
                    <tr key={row.procedureId}>
                      <th scope="row" className={`${CELL} text-left font-normal`}>
                        <span className="block font-bold">
                          {metricsProcedureName(row.procedureId)}
                        </span>
                        {areas.length > 0 && (
                          <span className="block text-sm text-texto-suave">
                            {areas.join(', ')}
                          </span>
                        )}
                      </th>
                      <td className={`${CELL} text-right tabular-nums`}>
                        {formatCount(row.completed)}
                      </td>
                      <td className={CELL}>
                        <span className="flex items-center gap-3">
                          <TimeBar ratio={row.barRatio} />
                          <span className="font-bold tabular-nums whitespace-nowrap">
                            {formatDuration(row.avgCompletionMs)}
                          </span>
                        </span>
                      </td>
                      <td className={`${CELL} tabular-nums whitespace-nowrap`}>
                        {formatDuration(row.minCompletionMs)}
                      </td>
                      <td className={`${CELL} tabular-nums whitespace-nowrap`}>
                        {formatDuration(row.maxCompletionMs)}
                      </td>
                      <td className={CELL}>
                        {row.slowestStep ? (
                          <>
                            {row.slowestStep.title}
                            <span className="whitespace-nowrap text-texto-suave">
                              {' '}
                              · {formatDuration(row.slowestStep.avgDurationMs)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
