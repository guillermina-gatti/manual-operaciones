// "Asistente" of the metrics panel (HU38, GET /api/metrics/assistant). A panel in bosque, like the
// summaries (hero.tsx), without a ring: the period, a headline made from the totals, a bar split by
// result with its legend, and three data. Below, four cards: small talk (apart from the questions),
// latency, tokens and feedback. The area filter uses the areas the people who asked belong to
// today, and the section says so. Errors read like the procedures ones.
import Link from 'next/link';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { HINT, TEXT_LINK } from '@/components/documents/design';
import {
  HERO_DIVIDER,
  HERO_MUTED,
  TABLE_FRAME,
} from '@/components/executions/activity-design';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMetricsError } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { formatShortPeriod } from '@/lib/executions/my-activity';
import type { AssistantMetrics } from '@/lib/metrics';
import {
  aiUnavailableLabel,
  answeredLabel,
  assistantHeadline,
  conflictLabel,
  noInfoLabel,
} from '@/lib/metrics/assistant';
import { metricsHref } from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { formatCount, formatLatency } from '@/lib/metrics/format';
import {
  DotLegend,
  HERO_EYEBROW,
  HERO_GRID_NO_RING,
  HERO_HEADLINE,
  HERO_PANEL,
  HeroDatum,
  SegmentedBar,
} from './hero';
import type { HeroPart } from './hero';
import { ASSISTANT_FILL, SECTION_MARK } from './metrics-design';
import { SectionHeading } from './SectionHeading';

interface AssistantMetricsCardProps {
  filters: PanelFilters;
  // What the page adds to "Ver todas mis áreas" (/metricas keeps its tab). By default nothing.
  keepParams?: (href: string) => string;
  state: ApiResource<AssistantMetrics>;
}

export function AssistantMetricsCard({ filters, state, keepParams }: AssistantMetricsCardProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading id={headingId}>Asistente</SectionHeading>
        <p className="text-texto-suave">
          Las consultas al asistente en el período, sin contar la charla social.
        </p>
        <p className={HINT}>El filtro por área usa las áreas actuales de quien preguntó.</p>
      </div>
      <AssistantMetricsContent filters={filters} state={state} keepParams={keepParams} />
    </section>
  );
}

function AssistantMetricsContent({
  filters,
  state,
  keepParams = (href) => href,
}: AssistantMetricsCardProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando las métricas del asistente…">
        <div aria-hidden="true" className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none">
          <div className="h-48 rounded-3xl bg-borde" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-36 rounded-[20px] bg-borde" />
            ))}
          </div>
        </div>
      </ScreenState>
    );
  }

  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMetricsError(state.error);
    return (
      <div className={`${TABLE_FRAME} px-6`}>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-6 text-center">
            <Link href={keepParams(metricsHref({ ...filters, areaId: null }))} className={TEXT_LINK}>
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }

  const { totals } = state.data;
  const noLatency = totals.latencyP50Ms === null && totals.latencyP95Ms === null;
  return (
    <>
      <AssistantHero totals={totals} from={filters.from} to={filters.to} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FactCard
          title="Charla social"
          note="No cuentan en las preguntas ni en los demás números."
        >
          <Fact label="Saludos y ayuda" value={formatCount(totals.smallTalk)} />
        </FactCard>
        <FactCard
          title="Latencia"
          note={noLatency ? 'Sin respuestas medibles todavía' : undefined}
        >
          <Fact label="Mediana (p50)" value={<Latency ms={totals.latencyP50Ms} />} />
          <Fact label="p95" value={<Latency ms={totals.latencyP95Ms} />} />
        </FactCard>
        <FactCard title="Tokens">
          <Fact label="De entrada" value={formatCount(totals.inputTokens)} />
          <Fact label="De salida" value={formatCount(totals.outputTokens)} />
        </FactCard>
        <FactCard title="Valoraciones">
          <Fact
            label="Útiles"
            dot="bg-exito"
            value={
              <span className="text-chip-area-texto">{formatCount(totals.feedback.useful)}</span>
            }
          />
          <Fact
            label="No útiles"
            dot="bg-naranja"
            value={
              <span className="text-durazno-texto">{formatCount(totals.feedback.notUseful)}</span>
            }
          />
        </FactCard>
      </div>
    </>
  );
}

function AssistantHero({
  totals,
  from,
  to,
}: {
  totals: AssistantMetrics['totals'];
  from: string;
  to: string;
}) {
  const labelId = useId();
  const headline = assistantHeadline(totals);
  const eyebrow = (
    <h3 className={`${HERO_EYEBROW} flex items-center gap-2`}>
      <span aria-hidden="true" className={SECTION_MARK} />
      <span>
        <span id={labelId}>Consultas</span> · {formatShortPeriod(from, to)}
      </span>
    </h3>
  );

  if (headline === null) {
    return (
      <section aria-labelledby={labelId} className={`${HERO_PANEL} flex flex-col gap-2`}>
        {eyebrow}
        <p className={HERO_HEADLINE}>Nadie le preguntó al asistente en este período.</p>
        <p className={HERO_MUTED}>Probá con otras fechas u otra área.</p>
      </section>
    );
  }

  const parts: HeroPart[] = [
    {
      key: 'answered',
      count: totals.answered,
      fill: ASSISTANT_FILL.answered,
      text: answeredLabel(totals.answered),
    },
    {
      key: 'noInfo',
      count: totals.noInfo,
      fill: ASSISTANT_FILL.noInfo,
      text: noInfoLabel(totals.noInfo),
    },
    {
      key: 'conflict',
      count: totals.conflict,
      fill: ASSISTANT_FILL.conflict,
      text: conflictLabel(totals.conflict),
    },
    {
      key: 'aiUnavailable',
      count: totals.aiUnavailable,
      fill: ASSISTANT_FILL.aiUnavailable,
      text: aiUnavailableLabel(totals.aiUnavailable),
    },
  ];

  return (
    <section aria-labelledby={labelId} className={HERO_PANEL}>
      <div className={HERO_GRID_NO_RING}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {eyebrow}
            <p className={HERO_HEADLINE}>{headline}</p>
          </div>
          <SegmentedBar parts={parts} total={totals.questions} />
          <DotLegend label="Preguntas por resultado" parts={parts} />
        </div>
        <dl
          className={`grid grid-cols-3 divide-x border-t pt-4 ${HERO_DIVIDER} lg:flex lg:flex-col lg:divide-x-0 lg:divide-y lg:self-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8`}
        >
          <HeroDatum label="Preguntas" value={formatCount(totals.questions)} />
          <HeroDatum label="Respondidas" value={formatCount(totals.answered)} />
          <HeroDatum label="IA no disponible" value={formatCount(totals.aiUnavailable)} />
        </dl>
      </div>
    </section>
  );
}

function FactCard({
  title,
  note,
  children,
}: {
  title: string;
  // A line under the numbers.
  note?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`${TABLE_FRAME} flex flex-col gap-3 p-5`}>
      <h3 id={headingId} className="text-sm font-bold text-texto">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
      {note && <p className={HINT}>{note}</p>}
    </section>
  );
}

function Fact({ label, value, dot }: { label: string; value: ReactNode; dot?: string }) {
  return (
    <div className="flex min-w-0 flex-col only:col-span-2">
      <dt className="flex items-center gap-1.5 text-sm font-semibold text-texto-suave">
        {dot && <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />}
        {label}
      </dt>
      <dd className="text-2xl font-extrabold text-bosque tabular-nums">{value}</dd>
    </div>
  );
}

// Without anything timed, a gray dash.
function Latency({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="font-bold text-texto-suave">—</span>;
  return <>{formatLatency(ms)}</>;
}
