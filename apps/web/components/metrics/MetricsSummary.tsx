// "Resumen general": one panel in bosque instead of five tiles, the same as "Tu resumen" of Mi
// actividad (components/metrics/hero.tsx). The ring with the % completed, the headline, the bar
// with its legend, and three data on the right: executions, abandoned with their share, and the
// average time. Every number comes from the API totals, never from the area cards, so a procedure
// with two areas counts once. Without executions, the empty state, without ring or bar.
//
// With the period before (the panel asks for it apart), each number says how it changed, under it,
// and a line under the panel says which period it is compared with. While that answer comes the
// lines keep their place, so nothing jumps; if it fails, the panel stays as it is and says so.
import { useId } from 'react';
import type { ReactNode } from 'react';
import type { ProceduresMetricsResponse } from '@/lib/api';
import { ARROW, comparedPeriodLabel, compareSummary } from '@/lib/metrics/comparison';
import type { Change, ComparedTotals, SummaryComparison } from '@/lib/metrics/comparison';
import type { Period } from '@/lib/metrics/filters';
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

// The numbers of the period before, with the same area: still coming, failed or there.
export type PreviousTotals =
  | { status: 'loading'; period: Period }
  | { status: 'error'; period: Period }
  | { status: 'success'; period: Period; totals: ComparedTotals };

type Compared = Extract<SummaryComparison, { kind: 'compared' }>;

interface MetricsSummaryProps {
  metrics: ProceduresMetricsResponse;
  // "Todas las áreas", "Todas mis áreas" or the area chosen.
  areaName: string;
  // A chosen area: the empty state names it.
  areaChosen: boolean;
  // Without both dates there is no period before, and nothing is compared.
  previous?: PreviousTotals | null;
}

export function MetricsSummary({ metrics, areaName, areaChosen, previous }: MetricsSummaryProps) {
  const labelId = useId();
  const periodId = useId();
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
  const comparison: SummaryComparison | null =
    previous?.status === 'success' ? compareSummary(totals, previous.totals) : null;
  // What goes under each number: its change, an empty line while the period before comes, or
  // nothing (no dates, it failed, or the period before had no executions).
  const changeOf = (pick: (compared: Compared) => Change) => {
    if (previous?.status === 'loading') return <ChangeLine change={null} describedBy={periodId} />;
    if (comparison?.kind !== 'compared') return undefined;
    return <ChangeLine change={pick(comparison)} describedBy={periodId} />;
  };
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
            {changeOf((compared) => compared.completedRate)}
          </div>

          <div className="col-span-2 flex min-w-0 flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:self-start">
            <SegmentedBar parts={parts} total={totals.started} />
            <DotLegend label="Ejecuciones del período" parts={parts} />
          </div>

          <dl className={HERO_DATA}>
            <HeroDatum
              label="Ejecuciones"
              value={formatCount(totals.started)}
              change={changeOf((compared) => compared.started)}
            />
            <HeroDatum
              label="Abandonadas"
              value={formatCount(totals.abandoned)}
              note={`(${spacedPercent(shares.abandoned)} del total)`}
              change={changeOf((compared) => compared.abandoned)}
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
              change={changeOf((compared) => compared.avgCompletion)}
            />
          </dl>
        </div>
      </section>

      {previous && <ComparedWith id={periodId} previous={previous} comparison={comparison} />}

      <p className="text-sm text-texto-suave">
        En curso: con avance en las últimas {staleAfterHours} h. Abandonadas: sin avanzar hace más
        de {staleAfterHours} h.
      </p>
    </div>
  );
}

// "▲ 3 más que el período anterior", in 13 px under the number. The arrow is drawn apart and hidden
// from a screen reader: the words say más or menos. When it got worse (more abandoned, slower), a
// small orange dot before the words, which already say it. Below lg, the short words, for the
// narrow columns. null: the empty line that keeps the place while the period before comes.
function ChangeLine({ change, describedBy }: { change: Change | null; describedBy: string }) {
  if (!change) {
    return (
      <span aria-hidden="true" data-testid="change-placeholder" className="block text-[13px]">
        {'\u00a0'}
      </span>
    );
  }
  return (
    <span
      data-testid="change"
      data-direction={change.direction}
      aria-describedby={describedBy}
      className={`block text-[13px] leading-snug font-normal whitespace-normal ${HERO_MUTED}`}
    >
      {change.worse && (
        <span
          aria-hidden="true"
          data-testid="worse-dot"
          className="mr-1.5 inline-block size-1.5 rounded-full bg-naranja align-middle"
        />
      )}
      {change.direction !== 'none' && (
        <span aria-hidden="true">{ARROW[change.direction]} </span>
      )}
      <span className="lg:hidden">{change.short}</span>
      <span className="max-lg:hidden">{change.words}</span>
    </span>
  );
}

// The line under the panel, in 12 px: which period the numbers are compared with, that the period
// before had no executions, or that it could not be compared.
function ComparedWith({
  id,
  previous,
  comparison,
}: {
  id: string;
  previous: PreviousTotals;
  comparison: SummaryComparison | null;
}) {
  const label = comparedPeriodLabel(previous.period);
  let text: ReactNode = `Comparado con ${label}`;
  if (previous.status === 'error') text = 'No se pudo comparar con el período anterior';
  else if (comparison?.kind === 'empty') text = `Sin ejecuciones en el período anterior (${label})`;
  return (
    <p id={id} data-testid="compared-with" className="text-xs text-texto-suave">
      {text}
    </p>
  );
}
