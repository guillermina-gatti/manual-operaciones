// "Tu resumen": one panel in bosque instead of five tiles. Three zones on the desktop: the ring with
// the % completed, the headline with the bar and its legend, and three data on the right. On the
// phone the same pieces are rearranged: the ring next to the headline, the bar, and the data in three
// columns (Empezadas, En curso, Tiempo medio); "sin avanzar" stays in the legend.
// Nothing moves by itself: no animation.
import { useId } from 'react';
import type { ReactNode } from 'react';
import type { MyMetricsTotals } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import {
  completedLabel,
  completedPercentLabel,
  durationParts,
  formatShortPeriod,
  inProgressLabel,
  shareOf,
  staleCountLabel,
  staleLabel,
  summaryHeadline,
} from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { outcomeShares } from '@/lib/metrics/summary';
import {
  HERO_DIVIDER,
  HERO_MUTED,
  OUTCOME_FILL,
  RING_STROKE,
  RING_TRACK,
} from './activity-design';

interface MySummaryHeroProps {
  totals: MyMetricsTotals;
  staleAfterHours: number;
  // The period chosen, "YYYY-MM-DD".
  from: string;
  to: string;
}

const PANEL = 'rounded-3xl bg-bosque px-5 py-6 text-blanco shadow-lg shadow-bosque/20 sm:px-8 sm:py-7';

export function MySummaryHero({ totals, staleAfterHours, from, to }: MySummaryHeroProps) {
  const labelId = useId();
  const eyebrow = (
    <h2 className={`text-xs font-bold tracking-wider uppercase ${HERO_MUTED}`}>
      <span id={labelId}>Tu resumen</span> · {formatShortPeriod(from, to)}
    </h2>
  );

  if (totals.started === 0) {
    return (
      <section aria-labelledby={labelId} className={`${PANEL} flex flex-col gap-2`}>
        {eyebrow}
        <p className="text-xl font-extrabold leading-tight lg:text-[28px]">
          No empezaste procedimientos en este período.
        </p>
        <p className={HERO_MUTED}>Probá con otras fechas u otra área.</p>
      </section>
    );
  }

  const shares = outcomeShares(totals);
  return (
    <section aria-labelledby={labelId} className={PANEL}>
      <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-4 gap-y-5 lg:grid-cols-[124px_minmax(0,1fr)_minmax(0,19rem)] lg:gap-x-8 lg:gap-y-4">
        <CompletedRing share={shares.completed} />

        <div className="col-start-2 flex min-w-0 flex-col gap-1.5 lg:self-end">
          {eyebrow}
          <p className="text-xl font-extrabold leading-tight break-words lg:text-[28px]">
            {summaryHeadline(totals.completed, totals.started)}
          </p>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:self-start">
          <OutcomeBar totals={totals} />
          <OutcomeLegend totals={totals} staleAfterHours={staleAfterHours} />
        </div>

        <dl
          className={`col-span-2 grid grid-cols-3 divide-x border-t pt-4 ${HERO_DIVIDER} lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:divide-x-0 lg:divide-y lg:self-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8`}
        >
          <Datum label="Empezadas" value={formatCount(totals.started)} />
          <Datum label="En curso" value={formatCount(totals.inProgress)} className="flex lg:hidden" />
          <Datum
            label={
              <>
                <span aria-hidden="true">Sin avanzar hace +{staleAfterHours} h</span>
                <span className="sr-only">{staleLabel(staleAfterHours)}</span>
              </>
            }
            value={formatCount(totals.abandoned)}
            className="hidden lg:flex"
          />
          <Datum
            label={
              <>
                Tiempo medio
                <span className="hidden lg:inline"> por ejecución completada</span>
              </>
            }
            value={<Duration ms={totals.avgCompletionMs} />}
          />
        </dl>
      </div>
    </section>
  );
}

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

// The bar: completed, in progress and without progress, each of its share of the started. A part
// with 0 is not drawn. It repeats the legend, so it is decorative.
export function OutcomeBar({ totals }: { totals: MyMetricsTotals }) {
  const parts = [
    { key: 'completed', count: totals.completed, fill: OUTCOME_FILL.completed },
    { key: 'inProgress', count: totals.inProgress, fill: OUTCOME_FILL.inProgress },
    { key: 'stale', count: totals.abandoned, fill: OUTCOME_FILL.stale },
  ].filter((part) => part.count > 0);
  return (
    <div
      aria-hidden="true"
      data-testid="outcome-bar"
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-blanco/16"
    >
      {parts.map((part) => (
        <span
          key={part.key}
          data-part={part.key}
          className={`h-full first:rounded-l-full last:rounded-r-full ${part.fill}`}
          style={{ width: `${shareOf(part.count, totals.started)}%` }}
        />
      ))}
    </div>
  );
}

// "● 25 completadas ● 1 en curso ● 1 sin avanzar": the dot is the color of the bar; the words say it.
export function OutcomeLegend({
  totals,
  staleAfterHours,
}: {
  totals: MyMetricsTotals;
  staleAfterHours: number;
}) {
  const items = [
    { key: 'completed', fill: OUTCOME_FILL.completed, text: completedLabel(totals.completed) },
    { key: 'inProgress', fill: OUTCOME_FILL.inProgress, text: inProgressLabel(totals.inProgress) },
    {
      key: 'stale',
      fill: OUTCOME_FILL.stale,
      text: staleCountLabel(totals.abandoned),
      // Read aloud as what it is: "1 sin avanzar hace más de 24 h".
      more: ` hace más de ${staleAfterHours} h`,
    },
  ];
  return (
    <ul aria-label="Tus ejecuciones del período" className={`flex flex-wrap gap-x-5 gap-y-1 text-sm ${HERO_MUTED}`}>
      {items.map((item) => (
        <li key={item.key} className="inline-flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${item.fill}`} />
          <span>
            {item.text}
            {item.more && <span className="sr-only">{item.more}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Datum({
  label,
  value,
  className = 'flex',
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${className} min-w-0 flex-col gap-1 px-3 first:pl-0 last:pr-0 ${HERO_DIVIDER} lg:flex-row lg:items-baseline lg:justify-between lg:gap-3 lg:px-0 lg:py-3 lg:first:pt-0 lg:last:pb-0`}
    >
      <dt className={`text-xs font-semibold sm:text-sm ${HERO_MUTED}`}>{label}</dt>
      <dd className="text-xl font-extrabold whitespace-nowrap tabular-nums lg:text-2xl">{value}</dd>
    </div>
  );
}

// "21 min 30 s", with the units smaller than the numbers. Without completed ones, "—".
function Duration({ ms }: { ms: number | null }) {
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
