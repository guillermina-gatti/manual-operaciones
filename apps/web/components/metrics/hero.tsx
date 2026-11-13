// The pieces of a summary panel in bosque, shared by "Tu resumen" (/ejecuciones/mi-actividad),
// "Resumen general" and the assistant of /metricas: the frame, the ring with the % completed, a bar
// split in parts with its legend, and the data on the right. Each panel decides its texts and which
// parts it has. Nothing moves by itself: no animation.
import type { ReactNode } from 'react';
import { formatDuration } from '@/lib/executions/format';
import { completedPercentLabel, durationParts, shareOf } from '@/lib/executions/my-activity';
import { HERO_DIVIDER, HERO_MUTED, RING_STROKE, RING_TRACK } from '@/components/executions/activity-design';

export const HERO_PANEL =
  'rounded-3xl bg-bosque px-5 py-6 text-blanco shadow-lg shadow-bosque/20 sm:px-8 sm:py-7';

// Three zones on the desktop (the ring, the headline with the bar, the data); on the phone the ring
// next to the headline, the bar below and the data in three columns.
export const HERO_GRID =
  'grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-4 gap-y-5 lg:grid-cols-[124px_minmax(0,1fr)_minmax(0,19rem)] lg:gap-x-8 lg:gap-y-4';
// Without the ring (the assistant): the headline and the bar, and the data on the right.
export const HERO_GRID_NO_RING =
  'grid grid-cols-1 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:gap-x-8 lg:gap-y-4';
export const HERO_EYEBROW = `text-xs font-bold tracking-wider uppercase ${HERO_MUTED}`;
export const HERO_HEADLINE = 'text-xl font-extrabold leading-tight break-words lg:text-[28px]';
export const HERO_DATA = `col-span-2 grid grid-cols-3 divide-x border-t pt-4 ${HERO_DIVIDER} lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:divide-x-0 lg:divide-y lg:self-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8`;

// The ring: 84 px on the phone, 124 px on the desktop. One image with its name ("92,6 %
// completadas"); the circle and the number inside are its picture.
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CompletedRing({ share }: { share: number | null }) {
  const label = completedPercentLabel(share);
  const done = Math.min(1, Math.max(0, share ?? 0));
  const [number] = label.split(' ');
  return (
    <div
      role="img"
      aria-label={`${label} completadas`}
      className="relative size-[84px] shrink-0 lg:row-span-2 lg:size-[124px]"
    >
      <svg viewBox="0 0 124 124" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="62" cy="62" r={RADIUS} fill="none" strokeWidth="12" className={RING_TRACK} />
        {done > 0 && (
          <circle
            cx="62"
            cy="62"
            r={RADIUS}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - done)}
            className={RING_STROKE}
          />
        )}
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-lg font-extrabold tabular-nums lg:text-[26px]"
      >
        {number}
        {share !== null && <span className="ml-0.5 text-xs font-bold lg:text-sm">%</span>}
      </span>
    </div>
  );
}

export interface HeroPart {
  key: string;
  count: number;
  // The fill class of its part of the bar and of its dot in the legend.
  fill: string;
  // The words of the legend: "25 completadas".
  text: ReactNode;
}

// Each part of its share of the total; a part with 0 is not drawn. It repeats the legend, so it is
// decorative.
export function SegmentedBar({ parts, total }: { parts: HeroPart[]; total: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="outcome-bar"
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-blanco/16"
    >
      {parts
        .filter((part) => part.count > 0)
        .map((part) => (
          <span
            key={part.key}
            data-part={part.key}
            className={`h-full first:rounded-l-full last:rounded-r-full ${part.fill}`}
            style={{ width: `${shareOf(part.count, total)}%` }}
          />
        ))}
    </div>
  );
}

// "● 25 completadas ● 1 en curso…": the dot is the color of the bar; the words say it.
export function DotLegend({ label, parts }: { label: string; parts: HeroPart[] }) {
  return (
    <ul aria-label={label} className={`flex flex-wrap gap-x-5 gap-y-1 text-sm ${HERO_MUTED}`}>
      {parts.map((part) => (
        <li key={part.key} className="inline-flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${part.fill}`} />
          <span>{part.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function HeroDatum({
  label,
  value,
  note,
  className = 'flex',
}: {
  label: ReactNode;
  value: ReactNode;
  // A line under the value, on the phone; next to it from lg ("(11,1 % del total)").
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${className} min-w-0 flex-col gap-1 px-3 first:pl-0 last:pr-0 ${HERO_DIVIDER} lg:flex-row lg:items-baseline lg:justify-between lg:gap-3 lg:px-0 lg:py-3 lg:first:pt-0 lg:last:pb-0`}
    >
      <dt className={`text-xs font-semibold sm:text-sm ${HERO_MUTED}`}>{label}</dt>
      <dd className="text-xl font-extrabold whitespace-nowrap tabular-nums lg:text-2xl">
        {value}
        {note && (
          <span className={`block text-xs font-semibold lg:ml-1.5 lg:inline lg:text-sm ${HERO_MUTED}`}>
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

// "21 min 30 s", with the units smaller than the numbers. Without a time, "—".
export function HeroDuration({ ms }: { ms: number | null }) {
  const text = formatDuration(ms);
  const parts = durationParts(text);
  if (parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) => (
        <span key={part.unit}>
          {index > 0 && ' '}
          {part.value}
          <span className="text-sm font-bold"> {part.unit}</span>
        </span>
      ))}
    </>
  );
}
