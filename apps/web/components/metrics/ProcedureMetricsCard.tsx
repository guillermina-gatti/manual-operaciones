// One procedure inside its area card, as a row that opens: its name, executions, completed (with
// their share and a green bar), in progress and abandoned. The row is a button (aria-expanded,
// aria-controls) inside the heading; open, it shows the table of its steps, with the version that
// ran last first and older versions folded below. No animation: it opens at once.
import { useId } from 'react';
import type { ProcedureMetricsResponse, VersionMetricsResponse } from '@/lib/api';
import { DONE_FILL, DONE_TRACK, ROW_LINE } from '@/components/executions/activity-design';
import { shareOf } from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { completedCountLabel, outcomeShares, spacedPercent } from '@/lib/metrics/summary';
import { CLOSED_PROCEDURE, OPEN_PROCEDURE } from './metrics-design';
import { StepMetricsTable } from './StepMetricsTable';

interface ProcedureMetricsCardProps {
  procedure: ProcedureMetricsResponse;
  open: boolean;
  onToggle: () => void;
  // The id of the part that opens: the leaf of the area points at it too.
  panelId: string;
}

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

  return (
    <article
      aria-labelledby={nameId}
      className={`border-t ${ROW_LINE} ${open ? OPEN_PROCEDURE : CLOSED_PROCEDURE}`}
    >
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex min-h-11 w-full items-center gap-4 px-5 py-4 text-left focus-visible:outline-naranja sm:px-6 ${
            open ? '' : 'hover:bg-salvia/60'
          }`}
        >
          <span className="grid min-w-0 flex-1 grid-cols-2 items-center gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
            <span id={nameId} className="col-span-2 text-lg font-bold break-words lg:col-span-1">
              {name}
            </span>
            <span className="text-sm tabular-nums">
              {formatCount(procedure.started)}{' '}
              {procedure.started === 1 ? 'ejecución' : 'ejecuciones'}
            </span>
            <span className="text-sm tabular-nums">
              <span className="font-semibold text-chip-area-texto">
                {completedCountLabel(procedure.completed)}
              </span>{' '}
              <span className="whitespace-nowrap text-texto-suave">
                ({spacedPercent(shares.completed)})
              </span>
              <span
                aria-hidden="true"
                data-testid="completed-bar"
                className={`mt-1.5 block h-2 w-full max-w-[160px] overflow-hidden rounded-full ${DONE_TRACK}`}
              >
                <span
                  className={`block h-full rounded-full ${DONE_FILL}`}
                  style={{ width: `${shareOf(procedure.completed, procedure.started)}%` }}
                />
              </span>
            </span>
            <span className="text-sm tabular-nums">
              {formatCount(procedure.inProgress)} en curso
            </span>
            <AbandonedCount count={procedure.abandoned} />
          </span>
          <Chevron open={open} />
        </button>
      </h4>

      <div id={panelId} hidden={!open} className="flex flex-col gap-4 px-5 pb-6 sm:px-6">
        {latest && <VersionSteps version={latest} name={name} label="Pasos" />}

        {older.length > 0 && (
          <details className="group rounded-xl border border-borde bg-blanco">
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

// 0: muted, it is the usual. More: bold, in the alert color of the team and with a dot, so it is
// not only color.
function AbandonedCount({ count }: { count: number }) {
  const text = `${formatCount(count)} ${count === 1 ? 'abandonada' : 'abandonadas'}`;
  if (count === 0) return <span className="text-sm text-texto-suave tabular-nums">{text}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-durazno-texto tabular-nums">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-durazno-texto" />
      {text}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 shrink-0 text-bosque ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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
    <section className="flex flex-col gap-2">
      <h5 className="text-sm font-semibold text-texto">
        {label}{' '}
        <span className="font-normal text-texto-suave">
          · {formatCount(version.started)} {version.started === 1 ? 'ejecución' : 'ejecuciones'}
        </span>
      </h5>
      <StepMetricsTable version={version} caption={`${label} de ${name}`} />
    </section>
  );
}
