// "Tu resumen": one panel in bosque instead of five tiles. Three zones on the desktop: the ring with
// the % completed, the headline with the bar and its legend, and three data on the right. On the
// phone the same pieces are rearranged: the ring next to the headline, the bar, and the data in three
// columns (Empezadas, En curso, Tiempo medio); "sin avanzar" stays in the legend.
// Nothing moves by itself: no animation. The pieces are the ones of components/metrics/hero.tsx,
// shared with "Resumen general" of /metricas.
import { useId } from 'react';
import type { MyMetricsTotals } from '@/lib/api';
import {
  completedLabel,
  formatShortPeriod,
  inProgressLabel,
  staleCountLabel,
  staleLabel,
  summaryHeadline,
} from '@/lib/executions/my-activity';
import {
  CompletedRing,
  DotLegend,
  HERO_DATA,
  HERO_EYEBROW,
  HERO_GRID,
  HERO_HEADLINE,
  HERO_PANEL,
  HeroDatum,
  HeroDuration,
  SegmentedBar,
} from '@/components/metrics/hero';
import type { HeroPart } from '@/components/metrics/hero';
import { formatCount } from '@/lib/metrics/format';
import { outcomeShares } from '@/lib/metrics/summary';
import { HERO_MUTED, OUTCOME_FILL } from './activity-design';

interface MySummaryHeroProps {
  totals: MyMetricsTotals;
  staleAfterHours: number;
  // The period chosen, "YYYY-MM-DD".
  from: string;
  to: string;
}

export function MySummaryHero({ totals, staleAfterHours, from, to }: MySummaryHeroProps) {
  const labelId = useId();
  const eyebrow = (
    <h2 className={HERO_EYEBROW}>
      <span id={labelId}>Tu resumen</span> · {formatShortPeriod(from, to)}
    </h2>
  );

  if (totals.started === 0) {
    return (
      <section aria-labelledby={labelId} className={`${HERO_PANEL} flex flex-col gap-2`}>
        {eyebrow}
        <p className={HERO_HEADLINE}>No empezaste procedimientos en este período.</p>
        <p className={HERO_MUTED}>Probá con otras fechas u otra área.</p>
      </section>
    );
  }

  const shares = outcomeShares(totals);
  const parts: HeroPart[] = [
    {
      key: 'completed',
      count: totals.completed,
      fill: OUTCOME_FILL.completed,
      text: completedLabel(totals.completed),
    },
    {
      key: 'inProgress',
      count: totals.inProgress,
      fill: OUTCOME_FILL.inProgress,
      text: inProgressLabel(totals.inProgress),
    },
    {
      key: 'stale',
      count: totals.abandoned,
      fill: OUTCOME_FILL.stale,
      // Read aloud as what it is: "1 sin avanzar hace más de 24 h".
      text: (
        <>
          {staleCountLabel(totals.abandoned)}
          <span className="sr-only"> hace más de {staleAfterHours} h</span>
        </>
      ),
    },
  ];
  return (
    <section aria-labelledby={labelId} className={HERO_PANEL}>
      <div className={HERO_GRID}>
        <CompletedRing share={shares.completed} />

        <div className="col-start-2 flex min-w-0 flex-col gap-1.5 lg:self-end">
          {eyebrow}
          <p className={HERO_HEADLINE}>{summaryHeadline(totals.completed, totals.started)}</p>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:self-start">
          <SegmentedBar parts={parts} total={totals.started} />
          <DotLegend label="Tus ejecuciones del período" parts={parts} />
        </div>

        <dl className={HERO_DATA}>
          <HeroDatum label="Empezadas" value={formatCount(totals.started)} />
          <HeroDatum
            label="En curso"
            value={formatCount(totals.inProgress)}
            className="flex lg:hidden"
          />
          <HeroDatum
            label={
              <>
                <span aria-hidden="true">Sin avanzar hace +{staleAfterHours} h</span>
                <span className="sr-only">{staleLabel(staleAfterHours)}</span>
              </>
            }
            value={formatCount(totals.abandoned)}
            className="hidden lg:flex"
          />
          <HeroDatum
            label={
              <>
                Tiempo medio
                <span className="hidden lg:inline"> por ejecución completada</span>
              </>
            }
            value={<HeroDuration ms={totals.avgCompletionMs} />}
          />
        </dl>
      </div>
    </section>
  );
}
