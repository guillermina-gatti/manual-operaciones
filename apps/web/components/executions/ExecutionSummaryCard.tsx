// "Resumen" of the side column: finished steps, when the execution started and, once completed,
// how long it took. Everything comes from the execution the API returns; no clock runs here.
import { useId } from 'react';
import { CARD } from '@/components/documents/design';
import type { ExecutionResponse } from '@/lib/api';
import { formatDuration, formatTime } from '@/lib/executions/format';
import type { ExecutionSummary } from '@/lib/executions/summary';

interface ExecutionSummaryCardProps {
  execution: ExecutionResponse;
  summary: ExecutionSummary;
}

export function ExecutionSummaryCard({ execution, summary }: ExecutionSummaryCardProps) {
  const headingId = useId();
  const rows: [string, string][] = [
    ['Pasos terminados', `${summary.finishedCount} de ${summary.total}`],
    ['Empezaste a las', formatTime(execution.startedAt)],
  ];
  if (summary.totalDurationMs !== null) {
    rows.push(['Tiempo total', formatDuration(summary.totalDurationMs)]);
  }

  return (
    <section aria-labelledby={headingId} className={`${CARD} flex flex-col gap-4 p-6`}>
      <h2 id={headingId} className="text-lg font-bold text-texto">
        Resumen
      </h2>
      <dl className="flex flex-col gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-texto-suave">{label}</dt>
            <dd className="font-bold text-texto tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
