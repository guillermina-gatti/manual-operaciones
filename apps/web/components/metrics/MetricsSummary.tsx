// General summary of the metrics panel: five tiles (executions, completed, in progress,
// abandoned, average time) and the feather bar with their distribution. Every number comes from
// the API totals or from the procedures, never from the area cards, so a procedure with two
// areas counts once. Texts stay in ink colors; nothing is told by color alone.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { CARD } from '@/components/documents/design';
import type { ProceduresMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { averageCompletionMs, outcomeShares } from '@/lib/metrics/summary';
import { FeatherBar, FeatherLegend } from './FeatherBar';
import { ChartIcon, CheckIcon, ClockIcon, CrossIcon, FeatherIcon, TimerIcon } from './icons';
import styles from './metrics.module.css';

interface Tile {
  label: string;
  icon: ReactNode;
  value: string;
  hint: string;
  hintClass?: string;
  // The duration is longer than a count: a smaller number so the five fit in one row.
  small?: boolean;
}

export function MetricsSummary({ metrics }: { metrics: ProceduresMetricsResponse }) {
  const distributionId = useId();
  const { totals, staleAfterHours } = metrics;
  const shares = outcomeShares(totals);
  const ofTotal = (share: number | null) => `${formatPercent(share)} del total`;

  const tiles: Tile[] = [
    {
      label: 'Ejecuciones',
      icon: <ChartIcon />,
      value: formatCount(totals.started),
      hint: 'en el período elegido',
    },
    {
      label: 'Completadas',
      icon: <CheckIcon />,
      value: formatCount(totals.completed),
      hint: ofTotal(shares.completed),
      hintClass: 'font-semibold text-chip-area-texto',
    },
    {
      label: 'En curso',
      icon: <ClockIcon />,
      value: formatCount(totals.inProgress),
      hint: ofTotal(shares.inProgress),
      hintClass: 'font-semibold text-texto',
    },
    {
      label: 'Abandonadas',
      icon: <CrossIcon />,
      value: formatCount(totals.abandoned),
      hint: ofTotal(shares.abandoned),
      hintClass: 'font-semibold text-rosa-alerta-texto',
    },
    {
      label: 'Tiempo medio',
      icon: <TimerIcon />,
      value: formatDuration(averageCompletionMs(metrics.procedures)),
      hint: 'por ejecución completada',
      small: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`${CARD} flex min-w-0 flex-col gap-2 p-5 last:col-span-2 sm:last:col-span-1`}
          >
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-xl bg-fondo text-naranja"
            >
              {tile.icon}
            </span>
            <dt className="text-sm font-semibold text-texto-suave">{tile.label}</dt>
            <dd
              className={`font-extrabold leading-none tracking-[-0.02em] text-bosque tabular-nums ${
                tile.small ? 'text-[28px]' : 'text-5xl'
              }`}
            >
              {tile.value}
            </dd>
            <dd className={`text-sm ${tile.hintClass ?? 'text-texto-suave'}`}>{tile.hint}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby={distributionId} className={`${CARD} flex flex-col gap-4 p-6 sm:p-8`}>
        <h3
          id={distributionId}
          className={`${styles.palette} flex items-center gap-2 text-xl font-bold text-texto`}
        >
          Distribución de ejecuciones
          <FeatherIcon className={styles.fallingFeather} />
        </h3>
        <FeatherBar counts={totals} />
        <FeatherLegend counts={totals} />
      </section>

      <p className="text-sm text-texto-suave">
        En curso: con avance en las últimas {staleAfterHours} h. Abandonadas: sin avanzar hace más
        de {staleAfterHours} h.
      </p>
    </div>
  );
}
