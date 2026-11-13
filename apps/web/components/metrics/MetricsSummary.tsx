// "Resumen general": one panel in bosque instead of five tiles, the same as "Tu resumen" of Mi
// actividad (components/metrics/hero.tsx). The ring with the % completed, the headline, the bar
// with its legend, and three data on the right: executions, abandoned with their share, and the
// average time. Every number comes from the API totals, never from the area cards, so a procedure
// with two areas counts once. Without executions, the empty state, without ring or bar.
import { useId } from 'react';
import type { ProceduresMetricsResponse } from '@/lib/api';
import { formatCount } from '@/lib/metrics/format';
import {
  abandonedCountLabel,
  completedCountLabel,
  generalSummaryHeadline,
  inProgressCountLabel,
  outcomeShares,
  spacedPercent,
} from '@/lib/metrics/summary';
import { HERO_MUTED, OUTCOME_FILL } from '@/components/executions/activity-design';
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
} from './hero';
import type { HeroPart } from './hero';
import { ABANDONED_FILL, SECTION_MARK } from './metrics-design';

interface MetricsSummaryProps {
  metrics: ProceduresMetricsResponse;
  // "Todas las áreas", "Todas mis áreas" or the area chosen.
  areaName: string;
  // A chosen area: the empty state names it.
  areaChosen: boolean;
}

export function MetricsSummary({ metrics, areaName, areaChosen }: MetricsSummaryProps) {
  const labelId = useId();
  const { totals, staleAfterHours } = metrics;
  const eyebrow = (
    <h2 className={`${HERO_EYEBROW} flex items-center gap-2`}>
      <span aria-hidden="true" className={SECTION_MARK} />
      <span>
        <span id={labelId}>Resumen general</span> · {areaName}
      </span>
    </h2>
  );

  if (totals.started === 0) {
    return (
      <section aria-labelledby={labelId} className={`${HERO_PANEL} flex flex-col gap-2`}>
        {eyebrow}
        <p className={HERO_HEADLINE}>
          {areaChosen ? `Sin ejecuciones en ${areaName}` : 'No hay ejecuciones en este período.'}
        </p>
        <p className={HERO_MUTED}>
          {areaChosen
            ? 'No hay procedimientos ejecutados en este período. Probá con otras fechas.'
            : 'Probá con otras fechas u otra área.'}
        </p>
      </section>
    );
  }

  const shares = outcomeShares(totals);
  const parts: HeroPart[] = [
    {
      key: 'completed',
      count: totals.completed,
      fill: OUTCOME_FILL.completed,
      text: completedCountLabel(totals.completed),
    },
    {
      key: 'inProgress',
      count: totals.inProgress,
      fill: OUTCOME_FILL.inProgress,
      text: inProgressCountLabel(totals.inProgress),
    },
    {
      key: 'abandoned',
      count: totals.abandoned,
      fill: ABANDONED_FILL,
      text: abandonedCountLabel(totals.abandoned),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby={labelId} className={HERO_PANEL}>
        <div className={HERO_GRID}>
          <CompletedRing share={shares.completed} />

          <div className="col-start-2 flex min-w-0 flex-col gap-1.5 lg:self-end">
            {eyebrow}
            <p className={HERO_HEADLINE}>
              {generalSummaryHeadline(totals.completed, totals.started)}
            </p>
          </div>

          <div className="col-span-2 flex min-w-0 flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:self-start">
            <SegmentedBar parts={parts} total={totals.started} />
            <DotLegend label="Ejecuciones del período" parts={parts} />
          </div>

          <dl className={HERO_DATA}>
            <HeroDatum label="Ejecuciones" value={formatCount(totals.started)} />
            <HeroDatum
              label="Abandonadas"
              value={formatCount(totals.abandoned)}
              note={`(${spacedPercent(shares.abandoned)} del total)`}
            />
            <HeroDatum
              label={
                <>
                  Tiempo medio
                  <span className="hidden lg:inline"> por ejecución completada</span>
                </>
              }
              // The exact average of the API, from the sums of every completed execution.
              value={<HeroDuration ms={totals.avgCompletionMs} />}
            />
          </dl>
        </div>
      </section>

      <p className="text-sm text-texto-suave">
        En curso: con avance en las últimas {staleAfterHours} h. Abandonadas: sin avanzar hace más
        de {staleAfterHours} h.
      </p>
    </div>
  );
}
