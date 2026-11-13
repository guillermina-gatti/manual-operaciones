// "Tus procedimientos recientes": each procedure the employee started in the period, the most
// recently started first (the order of the API). Their counts, their average time and the step
// that takes them longest in the latest version they ran. Only their executions.
//
// One table, rearranged (DESIGN.md 6.3): from lg, fixed columns (name | started 96 | completed 150 |
// without progress 128 | average 122 | slowest step | last time 128); below, each row is a card with
// the name and its areas, "N de M completadas" with its bar, the average and "sin avanzar" side by
// side, "Se traba en: …" and "Última vez: …". Each datum is drawn once; the words only the card needs
// are hidden from lg.
import { useId } from 'react';
import { AreaChips } from '@/components/documents/design';
import type { DocumentReference, MyProcedureMetrics } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { lastActivityParts, shareOf } from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
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
} from './activity-design';

interface RecentProceduresTableProps {
  procedures: MyProcedureMetrics[];
  staleAfterHours: number;
  // The areas the directory knows, by id; an unknown id is not shown.
  areas: ReadonlyMap<string, DocumentReference>;
}


export function RecentProceduresTable({
  procedures,
  staleAfterHours,
  areas,
}: RecentProceduresTableProps) {
  const headingId = useId();
  const staleName = `Sin avanzar hace más de ${staleAfterHours} horas`;
  const staleShort = `Sin avanzar +${staleAfterHours} h`;
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

      <div className={`${TABLE_FRAME} overflow-hidden`}>
        <table className="w-full border-collapse text-texto max-lg:block lg:table-fixed">
          <caption className="sr-only">Tus procedimientos recientes</caption>
          <colgroup>
            <col />
            <col className="w-[96px]" />
            <col className="w-[150px]" />
            <col className="w-[128px]" />
            <col className="w-[122px]" />
            <col />
            <col className="w-[128px]" />
          </colgroup>
          <thead className={`${TABLE_HEAD} max-lg:hidden`}>
            <tr>
              <th scope="col" className={TABLE_TH}>
                Procedimiento
              </th>
              <th scope="col" className={TABLE_TH}>
                Empezadas
              </th>
              <th scope="col" className={TABLE_TH}>
                Completadas
              </th>
              <th scope="col" className={TABLE_TH}>
                <span aria-hidden="true">{staleShort}</span>
                <span className="sr-only">{staleName}</span>
              </th>
              <th scope="col" className={TABLE_TH}>
                Tiempo medio
              </th>
              <th scope="col" className={TABLE_TH}>
                Paso que más te lleva
              </th>
              <th scope="col" className={TABLE_TH}>
                Última vez
              </th>
            </tr>
          </thead>
          <tbody className="max-lg:block">
            {procedures.map((procedure) => (
              <ProcedureRow
                key={procedure.procedureId}
                procedure={procedure}
                areas={procedure.areaIds.flatMap((id) => areas.get(id) ?? [])}
                staleShort={staleShort}
                staleName={staleName}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ProcedureRowProps {
  procedure: MyProcedureMetrics;
  areas: DocumentReference[];
  staleShort: string;
  staleName: string;
}

function ProcedureRow({ procedure, areas, staleShort, staleName }: ProcedureRowProps) {
  const last = lastActivityParts(procedure.lastStartedAt);
  const slowest = procedure.slowestStep;
  return (
    <tr
      className={`border-t ${ROW_LINE} first:border-t-0 lg:transition-colors lg:hover:bg-salvia/60 motion-reduce:transition-none max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-4 max-lg:gap-y-4 max-lg:px-5 max-lg:py-5 lg:first:border-t`}
    >
      <th scope="row" className={`${TABLE_TD} col-span-2 text-left font-normal max-lg:block`}>
        <span className="block text-[17px] leading-snug font-bold break-words">
          {metricsProcedureName(procedure.procedureId, procedure.title)}
        </span>
        {areas.length > 0 && (
          <span className="mt-1.5 block">
            <AreaChips areas={areas} />
          </span>
        )}
      </th>

      <td className={`${TABLE_TD} tabular-nums max-lg:hidden`}>{formatCount(procedure.started)}</td>

      <td className={`${TABLE_TD} col-span-2 max-lg:block`}>
        <span className="tabular-nums whitespace-nowrap">
          <strong className="font-bold">{formatCount(procedure.completed)}</strong>{' '}
          <span className="text-texto-suave">de {formatCount(procedure.started)}</span>
          <span className="lg:hidden"> completadas</span>
        </span>
        <span
          aria-hidden="true"
          className={`mt-2 block h-1.5 w-full overflow-hidden rounded-full lg:max-w-[110px] ${DONE_TRACK}`}
        >
          <span
            className={`block h-full rounded-full ${DONE_FILL}`}
            style={{ width: `${shareOf(procedure.completed, procedure.started)}%` }}
          />
        </span>
      </td>

      <td className={`${TABLE_TD} max-lg:order-1 max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>
          <span aria-hidden="true">{staleShort}</span>
          <span className="sr-only">{staleName}</span>
        </span>
        <StaleCount count={procedure.abandoned} />
      </td>

      <td className={`${TABLE_TD} max-lg:block`}>
        <span className={TABLE_CARD_LABEL}>Tiempo medio</span>
        <span className="text-lg font-bold whitespace-nowrap tabular-nums">
          {formatDuration(procedure.avgCompletionMs)}
        </span>
      </td>

      <td className={`${TABLE_TD} col-span-2 max-lg:order-2 max-lg:block`}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words">
            <span className="text-texto-suave lg:hidden">Se traba en: </span>
            {slowest ? `Paso ${slowest.order}: ${slowest.title}` : '—'}
          </span>
          {slowest && <span className={SLOW_TAG}>{formatDuration(slowest.avgDurationMs)}</span>}
        </span>
      </td>

      <td className={`${TABLE_TD} col-span-2 max-lg:order-3 max-lg:block`}>
        <span className="text-sm text-texto-suave lg:hidden">Última vez: </span>
        {last ? (
          <time dateTime={procedure.lastStartedAt} className="tabular-nums">
            <span className="text-sm lg:block">{last.day}</span>
            <span className="text-sm text-texto-suave lg:hidden">, </span>
            <span className="text-sm text-texto-suave lg:block lg:text-[13px]">{last.time}</span>
          </time>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

// 0: muted, it is the usual. More: bold, in the alert color and with a dot, so it is not only color.
export function StaleCount({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-texto-suave tabular-nums">0</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-bold text-durazno-texto tabular-nums">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-durazno-texto" />
      {formatCount(count)}
    </span>
  );
}
