// The row of metric tiles: an orange icon in a gray square, a label, a big number and a line
// below. Used by the procedures panel (/metricas) and by the employee's own activity.
import type { ReactNode } from 'react';
import { CARD } from '@/components/documents/design';

export interface MetricTile {
  label: string;
  icon: ReactNode;
  value: string;
  hint: string;
  hintClass?: string;
  // The duration is longer than a count: a smaller number so the five fit in one row.
  small?: boolean;
}

export function MetricTiles({ tiles }: { tiles: MetricTile[] }) {
  return (
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
  );
}
