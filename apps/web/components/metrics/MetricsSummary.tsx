// The headline numbers of the period, as a row of tiles. Plain numbers, no chart: each one is a
// single value. Texts stay in ink colors; nothing is told by color alone.
import type { ProceduresMetricsResponse } from '@/lib/api';
import { formatCount, formatPercent } from '@/lib/metrics/format';

interface Tile {
  label: string;
  value: string;
  hint: string;
}

export function MetricsSummary({ metrics }: { metrics: ProceduresMetricsResponse }) {
  const { totals, staleAfterHours } = metrics;
  const tiles: Tile[] = [
    { label: 'Iniciadas', value: formatCount(totals.started), hint: 'Ejecuciones en el período' },
    { label: 'Completadas', value: formatCount(totals.completed), hint: 'Llegaron al último paso' },
    {
      label: 'En curso',
      value: formatCount(totals.inProgress),
      hint: `Con avance en las últimas ${staleAfterHours} h`,
    },
    {
      label: 'Abandonadas',
      value: formatCount(totals.abandoned),
      hint: `Sin avanzar hace más de ${staleAfterHours} h`,
    },
    {
      label: 'Finalización',
      value: formatPercent(totals.completionRate),
      hint: 'Completadas sobre iniciadas',
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex min-w-0 flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm last:col-span-2 sm:last:col-span-1 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{tile.label}</dt>
          <dd className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {tile.value}
          </dd>
          <dd className="text-xs text-zinc-600 dark:text-zinc-400">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
