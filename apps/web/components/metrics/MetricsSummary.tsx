// General summary of the metrics panel: five tiles (executions, completed, in progress,
// abandoned, average time) and the feather bar with their distribution. Every number comes from
// the API totals or from the procedures, never from the area cards, so a procedure with two
// areas counts once. Texts stay in ink colors; nothing is told by color alone.
import { useId } from 'react';
import { CARD } from '@/components/documents/design';
import type { ProceduresMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { outcomeShares } from '@/lib/metrics/summary';
import { FeatherBar, FeatherLegend } from './FeatherBar';
import { MetricTiles } from './MetricTiles';
import type { MetricTile } from './MetricTiles';
import { ChartIcon, CheckIcon, ClockIcon, CrossIcon, FeatherIcon, TimerIcon } from './icons';
import styles from './metrics.module.css';

export function MetricsSummary({ metrics }: { metrics: ProceduresMetricsResponse }) {
  const distributionId = useId();
  const { totals, staleAfterHours } = metrics;
  const shares = outcomeShares(totals);
  const ofTotal = (share: number | null) => `${formatPercent(share)} del total`;

  const tiles: MetricTile[] = [
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
      // The exact average of the API, from the sums of every completed execution.
      value: formatDuration(totals.avgCompletionMs),
      hint: 'por ejecución completada',
      small: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <MetricTiles tiles={tiles} />

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
