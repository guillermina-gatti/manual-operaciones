// Assistant card of the metrics panel (HU38, GET /api/metrics/assistant): the questions of the
// period by result, small talk apart, latency, tokens and feedback. The area filter uses the
// areas the people who asked belong to today, and the card says so. Errors read like the
// procedures ones.
import Link from 'next/link';
import { useId } from 'react';
import { CARD, HINT, TEXT_LINK } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMetricsError } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import type { AssistantMetrics } from '@/lib/metrics';
import { metricsHref } from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { formatCount, formatLatency } from '@/lib/metrics/format';
import { MetricsFacts } from './MetricsFacts';

interface AssistantMetricsCardProps {
  filters: PanelFilters;
  state: ApiResource<AssistantMetrics>;
}

export function AssistantMetricsCard({ filters, state }: AssistantMetricsCardProps) {
  const headingId = useId();

  return (
    <article
      aria-labelledby={headingId}
      className={`${CARD} flex min-h-36 min-w-0 flex-col gap-5 p-6 sm:p-8`}
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-[22px] font-bold text-texto">
          Asistente
        </h3>
        <p className="text-sm text-texto-suave">
          Las consultas al asistente en el período, sin contar la charla social.
        </p>
        <p className={HINT}>El filtro por área usa las áreas actuales de quien preguntó.</p>
      </div>
      <AssistantMetricsContent filters={filters} state={state} />
    </article>
  );
}

function AssistantMetricsContent({ filters, state }: AssistantMetricsCardProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <ScreenState kind="loading" label="Cargando las métricas del asistente…" />;
  }

  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMetricsError(state.error);
    return (
      <div>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-6 text-center">
            <Link href={metricsHref({ ...filters, areaId: null })} className={TEXT_LINK}>
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }

  const { totals } = state.data;
  return (
    <>
      <MetricsFacts
        title="Consultas"
        facts={[
          ['Preguntas', formatCount(totals.questions)],
          ['Respondidas', formatCount(totals.answered)],
          ['Sin información', formatCount(totals.noInfo)],
          ['Con contradicción', formatCount(totals.conflict)],
          ['IA no disponible', formatCount(totals.aiUnavailable)],
        ]}
      />
      <div className="flex flex-col gap-1">
        <MetricsFacts
          title="Charla social"
          facts={[['Saludos y ayuda', formatCount(totals.smallTalk)]]}
        />
        <p className={HINT}>No cuentan en las preguntas ni en los demás números.</p>
      </div>
      <MetricsFacts
        title="Latencia"
        facts={[
          ['Mediana (p50)', formatLatency(totals.latencyP50Ms)],
          ['p95', formatLatency(totals.latencyP95Ms)],
        ]}
      />
      <MetricsFacts
        title="Tokens"
        facts={[
          ['De entrada', formatCount(totals.inputTokens)],
          ['De salida', formatCount(totals.outputTokens)],
        ]}
      />
      <MetricsFacts
        title="Valoraciones"
        facts={[
          ['Útiles', formatCount(totals.feedback.useful)],
          ['No útiles', formatCount(totals.feedback.notUseful)],
        ]}
      />
    </>
  );
}
