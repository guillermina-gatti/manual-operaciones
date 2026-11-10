// One procedure inside its area card: its executions in the period, the feather bar and the
// table of its steps. The version with the latest execution goes first; older versions, with
// their own steps, fold below.
import { useId } from 'react';
import type { ProcedureMetricsResponse, VersionMetricsResponse } from '@/lib/api';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { outcomeShares } from '@/lib/metrics/summary';
import { FeatherBar } from './FeatherBar';
import { StepMetricsTable } from './StepMetricsTable';

export function ProcedureMetricsCard({ procedure }: { procedure: ProcedureMetricsResponse }) {
  const headingId = useId();
  const name = metricsProcedureName(procedure.procedureId);
  const [latest, ...older] = procedure.versions;
  const shares = outcomeShares(procedure);

  return (
    <article aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-baseline lg:justify-between">
        <h4 id={headingId} className="break-words text-lg font-bold text-texto">
          {name}
        </h4>
        <p className="text-sm text-texto-suave">
          {formatCount(procedure.started)} {procedure.started === 1 ? 'ejecución' : 'ejecuciones'}{' '}
          ·{' '}
          <strong className="font-semibold text-chip-area-texto">
            {formatCount(procedure.completed)} completadas ({formatPercent(shares.completed)})
          </strong>{' '}
          · {formatCount(procedure.inProgress)} en curso ·{' '}
          <strong className="font-semibold text-rosa-alerta-texto">
            {formatCount(procedure.abandoned)} abandonadas ({formatPercent(shares.abandoned)})
          </strong>
        </p>
      </header>

      <FeatherBar counts={procedure} size="md" />

      {latest && (
        <VersionSteps version={latest} name={name} label="Pasos" />
      )}

      {older.length > 0 && (
        <details className="group rounded-xl border border-borde">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold text-bosque hover:bg-salvia">
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
    </article>
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
