// One procedure inside its area card, as a full-width row that opens: its name, executions,
// completed (with their share and a bar), in progress and abandoned, and a chevron. The row is a
// button (aria-expanded, aria-controls) inside the heading; open, only the row turns solid bosque
// and the table of its steps shows below, on white, with the version that ran last first and older
// versions folded below. From lg the row is a grid of fixed columns; below, it stacks: the name and
// the chevron on top, the data in one column.
import { useId } from 'react';
import type { ProcedureMetricsResponse, VersionMetricsResponse } from '@/lib/api';
import {
  DONE_FILL,
  DONE_TRACK,
  HERO_MUTED,
  ROW_LINE,
} from '@/components/executions/activity-design';
import { shareOf } from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { outcomeShares, spacedPercent } from '@/lib/metrics/summary';
import {
  CHEVRON_CLOSED,
  CHEVRON_OPEN,
  OPEN_ALERT,
  OPEN_BAR_FILL,
  OPEN_BAR_TRACK,
  OPEN_ROW,
  ROW_HOVER,
} from './metrics-design';
import { StepMetricsTable } from './StepMetricsTable';

interface ProcedureMetricsCardProps {
  procedure: ProcedureMetricsResponse;
  open: boolean;
  onToggle: () => void;
  // The id of the part that opens: the leaf of the area points at it too.
  panelId: string;
}

// Fixed columns from lg: name | executions 120 | completed 230 | in progress 100 | abandoned 130 |
// chevron 36. Below, two columns: the data under the name, the chevron next to the name.
export const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_36px] gap-x-4 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_120px_230px_100px_130px_36px] lg:items-center';
const DATUM = 'col-start-1 text-sm tabular-nums lg:col-start-auto';

export function ProcedureMetricsCard({
  procedure,
  open,
  onToggle,
  panelId,
}: ProcedureMetricsCardProps) {
  const nameId = useId();
  const name = metricsProcedureName(procedure.procedureId, procedure.title);
  const [latest, ...older] = procedure.versions;
  const shares = outcomeShares(procedure);
  // The words around the numbers: muted on white, HERO_MUTED on bosque.
  const muted = open ? HERO_MUTED : 'text-texto-suave';
  const number = `text-base font-bold ${open ? 'text-blanco' : 'text-texto'}`;

  return (
    <article aria-labelledby={nameId} className={`border-t ${ROW_LINE}`}>
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`${ROW_GRID} min-h-11 w-full px-6 py-4 text-left transition-colors focus-visible:outline-naranja focus-visible:-outline-offset-4 motion-reduce:transition-none ${
            open ? OPEN_ROW : `bg-blanco text-texto ${ROW_HOVER}`
          }`}
        >
          <span id={nameId} className="col-start-1 row-start-1 text-lg font-bold break-words">
            {name}
          </span>
          <span className={DATUM}>
            <span className={number}>{formatCount(procedure.started)}</span>{' '}
            <span className={muted}>{procedure.started === 1 ? 'ejecución' : 'ejecuciones'}</span>
          </span>
          <span className={DATUM}>
            <span className={number}>{formatCount(procedure.completed)}</span>{' '}
            <span className={muted}>
              {procedure.completed === 1 ? 'completada' : 'completadas'}{' '}
              <span className="whitespace-nowrap">({spacedPercent(shares.completed)})</span>
            </span>
            <span
              aria-hidden="true"
              data-testid="completed-bar"
              className={`mt-1.5 block h-2 w-full max-w-[200px] overflow-hidden rounded-full ${
                open ? OPEN_BAR_TRACK : DONE_TRACK
              }`}
            >
              <span
                className={`block h-full rounded-full ${open ? OPEN_BAR_FILL : DONE_FILL}`}
                style={{ width: `${shareOf(procedure.completed, procedure.started)}%` }}
              />
            </span>
          </span>
          <span className={DATUM}>
            <span className={number}>{formatCount(procedure.inProgress)}</span>{' '}
            <span className={muted}>en curso</span>
          </span>
          <AbandonedCount count={procedure.abandoned} open={open} number={number} muted={muted} />
          <span
            aria-hidden="true"
            data-testid="chevron"
            className={`col-start-2 row-start-1 flex size-8 items-center justify-center self-start justify-self-end rounded-full lg:col-start-auto lg:row-start-auto lg:self-center ${
              open ? CHEVRON_OPEN : CHEVRON_CLOSED
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`size-4 transition-transform duration-100 motion-reduce:transition-none ${
                open ? 'rotate-180' : ''
              }`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h4>

      <div
        id={panelId}
        hidden={!open}
        className="flex flex-col gap-3 bg-blanco px-6 pt-[18px] pb-[22px]"
      >
        {latest && <VersionSteps version={latest} name={name} label="Pasos" />}

        {older.length > 0 && (
          <details className="group rounded-xl border border-[#DDE3DE] bg-blanco">
            <summary className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4 font-semibold text-bosque hover:bg-salvia">
              <span
                aria-hidden="true"
                className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
              >
                ›
              </span>
              Versiones anteriores ({older.length})
            </summary>
            <div className="flex flex-col gap-6 p-4">
              {older.map((version, i) => (
                <VersionSteps
                  key={version.procedureVersionId}
                  version={version}
                  name={name}
                  label={`Versión anterior ${i + 1}`}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

// 0: muted, it is the usual. More: bold, in the alert color of the team (a light peach on the open
// row's bosque) and with a dot, so it is not only color.
function AbandonedCount({
  count,
  open,
  number,
  muted,
}: {
  count: number;
  open: boolean;
  number: string;
  muted: string;
}) {
  const word = count === 1 ? 'abandonada' : 'abandonadas';
  if (count === 0) {
    return (
      <span className={DATUM}>
        <span className={number}>0</span> <span className={muted}>{word}</span>
      </span>
    );
  }
  const alert = open ? OPEN_ALERT : 'text-durazno-texto';
  return (
    <span
      data-testid="abandoned-alert"
      className={`${DATUM} inline-flex items-center gap-1.5 font-bold ${alert}`}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
      <span>
        <span className="text-base">{formatCount(count)}</span> {word}
      </span>
    </span>
  );
}

function VersionSteps({
  version,
  name,
  label,
}: {
  version: VersionMetricsResponse;
  name: string;
  label: string;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h5 className="text-xs font-bold tracking-[0.04em] text-texto-suave uppercase">
        {label} · {formatCount(version.started)}{' '}
        {version.started === 1 ? 'ejecución' : 'ejecuciones'}
      </h5>
      <StepMetricsTable version={version} caption={`${label} de ${name}`} />
    </section>
  );
}
