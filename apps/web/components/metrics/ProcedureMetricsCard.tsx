// One procedure: its executions in the period and the table of its steps. The version with the
// latest execution goes first; older versions, with their own steps, fold below.
import { useId } from 'react';
import type { ProcedureMetricsResponse, VersionMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { procedureName } from '@/lib/executions/sample-procedures';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { StepMetricsTable } from './StepMetricsTable';

interface ProcedureMetricsCardProps {
  procedure: ProcedureMetricsResponse;
  // Area id → name; an unknown id is not shown.
  areaNames: ReadonlyMap<string, string>;
}

export function ProcedureMetricsCard({ procedure, areaNames }: ProcedureMetricsCardProps) {
  const headingId = useId();
  const name = procedureName(procedure.procedureId);
  const [latest, ...older] = procedure.versions;
  const areas = procedure.areaIds.flatMap((id) => areaNames.get(id) ?? []);

  const facts = [
    ['Iniciadas', formatCount(procedure.started)],
    ['Completadas', formatCount(procedure.completed)],
    ['En curso', formatCount(procedure.inProgress)],
    ['Abandonadas', formatCount(procedure.abandoned)],
    ['Tiempo medio total', formatDuration(procedure.avgCompletionMs)],
  ];

  return (
    <article
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h3
            id={headingId}
            className="break-words text-xl font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {name}
          </h3>
          {areas.length > 0 && (
            <ul aria-label="Áreas" className="flex flex-wrap gap-2">
              {areas.map((area) => (
                <li
                  key={area}
                  className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {area}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="shrink-0 self-start rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-inset ring-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:ring-blue-800">
          <span className="text-lg font-semibold">{formatPercent(procedure.completionRate)}</span>{' '}
          completadas
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</dd>
          </div>
        ))}
      </dl>

      {latest && <VersionSteps version={latest} name={name} label="Pasos" />}

      {older.length > 0 && (
        <details className="group rounded-lg border border-zinc-200 dark:border-zinc-800">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-blue-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:bg-zinc-800/60">
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
      <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {label}{' '}
        <span className="font-normal text-zinc-600 dark:text-zinc-400">
          · {formatCount(version.started)}{' '}
          {version.started === 1 ? 'ejecución' : 'ejecuciones'}
        </span>
      </h4>
      <StepMetricsTable steps={version.steps} caption={`${label} de ${name}`} />
    </section>
  );
}
