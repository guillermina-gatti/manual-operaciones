// "Tiempo por procedimiento": how long a complete execution takes, from start to end, slowest
// first, with the fastest and the slowest completed execution of each procedure. Every column but
// the slowest step sorts (components/executions/TableSort.tsx); on the phone, a selector does it.
//
// The table of "Tus procedimientos recientes" (Mi actividad), with its frame, head and cells
// (activity-design.ts). From lg, fixed columns: name | completed 130 | average 190 | fastest 120 |
// slowest 120 | slowest step. Every data column goes to the left, headers included, with
// tabular-nums. Below lg each row is a card: the name and its areas, completed, the average with its
// bar, the fastest and the slowest side by side, and the slowest step. Each datum is drawn once; the
// words only the card needs are hidden from lg.
import { useId } from 'react';
import { AreaChips } from '@/components/documents/design';
import { SortSelect, SortableHeader, useTableSort } from '@/components/executions/TableSort';
import {
  DONE_FILL,
  DONE_TRACK,
  ROW_LINE,
  SLOW_TAG,
  TABLE_CARD_LABEL,
  TABLE_FRAME,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TH,
} from '@/components/executions/activity-design';
import type { DocumentReference, ProcedureMetricsResponse } from '@/lib/api';
import type { SortColumn } from '@/lib/executions/table-sort';
import { formatDuration } from '@/lib/executions/format';
import { formatCount } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { procedureTimeRows } from '@/lib/metrics/procedure-time';
import type { ProcedureTimeRow } from '@/lib/metrics/procedure-time';
import { DATA_CELL } from './metrics-design';
import { SectionHeading } from './SectionHeading';

interface ProcedureTimeTableProps {
  procedures: ProcedureMetricsResponse[];
  // The areas the directory knows, by id; an unknown id is not shown.
  areas: ReadonlyMap<string, DocumentReference>;
}

// The slowest row's bar is naranja (an indicator, never text); the others, the green of completed.
const SLOWEST_FILL = 'bg-naranja';

type TimeColumn = 'procedure' | 'completed' | 'average' | 'fastest' | 'slowest';

const nameOf = (row: ProcedureTimeRow) => metricsProcedureName(row.procedureId, row.title);

// By their values: the name, the count and the times in milliseconds.
const COLUMNS: readonly SortColumn<ProcedureTimeRow, TimeColumn>[] = [
  { key: 'procedure', label: 'Procedimiento', value: nameOf, first: 'ascending' },
  { key: 'completed', label: 'Completadas', value: (row) => row.completed, first: 'descending' },
  {
    key: 'average',
    label: 'Tiempo medio total',
    value: (row) => row.avgCompletionMs,
    first: 'descending',
  },
  { key: 'fastest', label: 'Más rápida', value: (row) => row.minCompletionMs, first: 'descending' },
  { key: 'slowest', label: 'Más lenta', value: (row) => row.maxCompletionMs, first: 'descending' },
];

export function ProcedureTimeTable({ procedures, areas }: ProcedureTimeTableProps) {
  const headingId = useId();
  // The default order: slowest average first.
  const byAverage = procedureTimeRows(procedures);
  const { rows, sort, toggle, setSort } = useTableSort(byAverage, COLUMNS, nameOf);
  // The slowest procedure keeps its orange bar in any order.
  const slowestId = byAverage[0]?.avgCompletionMs != null ? byAverage[0].procedureId : null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading id={headingId}>Tiempo por procedimiento</SectionHeading>
        <p className="text-texto-suave">
          Cuánto tarda una ejecución completa, de inicio a fin. Ordenado de mayor a menor tiempo
          medio<span className="max-lg:hidden">; tocá un encabezado para ordenar por esa columna</span>
          .
        </p>
      </div>

      {byAverage.length > 1 && (
        <SortSelect
          columns={COLUMNS}
          defaultLabel="Mayor tiempo medio primero (por defecto)"
          sort={sort}
          onChange={setSort}
        />
      )}

      <div className={`${TABLE_FRAME} overflow-hidden`}>
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-texto-suave">
            No hay ejecuciones en este período.
          </p>
        ) : (
          <table className="w-full border-collapse text-texto max-lg:block lg:table-fixed">
            <caption className="sr-only">Tiempo por procedimiento</caption>
            <colgroup>
              <col />
              <col className="w-[130px]" />
              <col className="w-[190px]" />
              <col className="w-[120px]" />
              <col className="w-[120px]" />
              <col />
            </colgroup>
            <thead className={`${TABLE_HEAD} max-lg:hidden`}>
              <tr>
                {COLUMNS.map((column) => (
                  <SortableHeader
                    key={column.key}
                    column={column}
                    sort={sort}
                    onToggle={toggle}
                  />
                ))}
                <th scope="col" className={TABLE_TH}>
                  Paso que más tarda
                </th>
              </tr>
            </thead>
            <tbody className="max-lg:block">
              {rows.map((row) => (
                <TimeRow
                  key={row.procedureId}
                  row={row}
                  slowest={row.procedureId === slowestId}
                  areas={row.areaIds.flatMap((id) => areas.get(id) ?? [])}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

interface TimeRowProps {
  row: ProcedureTimeRow;
  slowest: boolean;
  areas: DocumentReference[];
}

function TimeRow({ row, slowest, areas }: TimeRowProps) {
  return (
    <tr
      className={`border-t ${ROW_LINE} first:border-t-0 lg:transition-colors lg:hover:bg-salvia/60 motion-reduce:transition-none max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-4 max-lg:gap-y-4 max-lg:px-5 max-lg:py-5 lg:first:border-t`}
    >
      <th scope="row" className={`${TABLE_TD} col-span-2 text-left font-normal max-lg:block`}>
        <span className="block text-[17px] leading-snug font-bold break-words">
          {metricsProcedureName(row.procedureId, row.title)}
        </span>
        {areas.length > 0 && (
          <span className="mt-1.5 block">
            <AreaChips areas={areas} />
          </span>
        )}
      </th>

      <td className={`${DATA_CELL} col-span-2 max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>Completadas</span>
        {formatCount(row.completed)}
      </td>

      <td className={`${DATA_CELL} col-span-2 max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>Tiempo medio total</span>
        <span className="block text-[17px] font-bold whitespace-nowrap">
          {formatDuration(row.avgCompletionMs)}
        </span>
        {row.avgCompletionMs !== null && (
          <span
            aria-hidden="true"
            data-testid="time-bar"
            className={`mt-2 block h-2 w-full overflow-hidden rounded-full lg:max-w-[150px] ${DONE_TRACK}`}
          >
            <span
              data-slowest={slowest || undefined}
              className={`block h-full rounded-full ${slowest ? SLOWEST_FILL : DONE_FILL}`}
              // At least 3 %, so a short time never looks like nothing.
              style={{ width: `${Math.max(3, row.barRatio * 100)}%` }}
            />
          </span>
        )}
      </td>

      <td className={`${DATA_CELL} max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>Más rápida</span>
        <span className="whitespace-nowrap">{formatDuration(row.minCompletionMs)}</span>
      </td>

      <td className={`${DATA_CELL} max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>Más lenta</span>
        <span className="whitespace-nowrap">{formatDuration(row.maxCompletionMs)}</span>
      </td>

      <td className={`${DATA_CELL} col-span-2 max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>Paso que más tarda</span>
        {row.slowestStep ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words">{row.slowestStep.title}</span>
            <span className={SLOW_TAG}>{formatDuration(row.slowestStep.avgDurationMs)}</span>
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}
