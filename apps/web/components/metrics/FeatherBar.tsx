// The feather bar of the metrics panel: completed, in progress and abandoned executions as three
// segments shaped like the hornero's feathers. The colors live in metrics.module.css. Screen
// readers get the counts as text (role="img"); on screen, each segment carries its percentage
// and the legend the counts, so nothing is told by color alone.
import type { ExecutionCounts } from '@/lib/api';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { outcomeShares } from '@/lib/metrics/summary';
import { FeatherIcon } from './icons';
import styles from './metrics.module.css';

type Size = 'lg' | 'md' | 'sm';

const HEIGHT: Record<Size, string> = { lg: 'h-8', md: 'h-3.5', sm: 'h-3' };

interface FeatherBarProps {
  counts: ExecutionCounts;
  // lg: 32 px with the percentage inside each segment. md and sm: thin, without text.
  size?: Size;
  className?: string;
}

export function distributionLabel({ completed, inProgress, abandoned }: ExecutionCounts): string {
  return `Distribución: ${completed} completadas, ${inProgress} en curso, ${abandoned} abandonadas`;
}

export function FeatherBar({ counts, size = 'lg', className = '' }: FeatherBarProps) {
  const shares = outcomeShares(counts);
  const segments = [
    { key: 'completed', share: shares.completed, className: styles.completadas },
    { key: 'inProgress', share: shares.inProgress, className: styles.curso },
    { key: 'abandoned', share: shares.abandoned, className: styles.abandonadas },
  ].filter((segment) => segment.share !== null && segment.share > 0);

  return (
    <div
      role="img"
      aria-label={distributionLabel(counts)}
      className={`${styles.palette} flex w-full gap-1 ${HEIGHT[size]} ${className}`}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={`${styles.segment} ${segment.className}`}
          style={{ flexGrow: segment.share!, flexBasis: 0 }}
        >
          {size === 'lg' && (
            // A narrow segment cuts its text instead of overflowing.
            <span
              aria-hidden="true"
              className="relative z-10 truncate px-3 text-sm font-bold tabular-nums"
            >
              {formatPercent(segment.share)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Counts only: the percentage is already on the bar.
export function FeatherLegend({ counts }: { counts: ExecutionCounts }) {
  const items = [
    { label: 'Completadas', value: counts.completed, className: styles.legendCompletadas },
    { label: 'En curso', value: counts.inProgress, className: styles.legendCurso },
    { label: 'Abandonadas', value: counts.abandoned, className: styles.legendAbandonadas },
  ];
  return (
    <ul className={`${styles.palette} flex flex-wrap gap-x-6 gap-y-2`}>
      {items.map((item) => (
        <li key={item.label} className={`${styles.legendItem} flex items-center gap-2`}>
          <FeatherIcon className={`size-4 ${styles.legendFeather} ${item.className}`} />
          <span className="text-texto-suave">
            {item.label}: <strong className="font-bold text-texto">{formatCount(item.value)}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

// A single green feather for a time, over a gray track: ratio is this time over the longest one
// of its list (0 to 1). Decorative: the duration is always written next to it.
export function TimeBar({ ratio, className = '' }: { ratio: number; className?: string }) {
  const percent = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <span
      aria-hidden="true"
      className={`${styles.palette} flex h-2.5 w-24 shrink-0 overflow-hidden rounded-full bg-borde ${className}`}
    >
      {percent > 0 && (
        <span
          className={`${styles.segment} ${styles.completadas}`}
          // At least a sliver, so a short time never looks like zero.
          style={{ width: `max(6px, ${percent}%)` }}
        />
      )}
    </span>
  );
}
