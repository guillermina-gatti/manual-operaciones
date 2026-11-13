// Documents card of the metrics panel (HU38, GET /api/metrics/documents). Almost every total is
// the current state of the active documents; the dates only change «Cargados». The card says so,
// so a period that barely moves the numbers does not look broken. Errors read like the
// procedures ones.
import Link from 'next/link';
import { useId } from 'react';
import { CARD, TEXT_LINK } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMetricsError } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { formatReviewDate as formatDay } from '@/lib/documents/format';
import type { DocumentMetrics } from '@/lib/metrics';
import { metricsHref } from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { formatCount } from '@/lib/metrics/format';
import { MetricsFacts } from './MetricsFacts';

interface DocumentMetricsCardProps {
  filters: PanelFilters;
  // What the page adds to "Ver todas mis áreas" (/metricas keeps its tab). By default nothing.
  keepParams?: (href: string) => string;
  state: ApiResource<DocumentMetrics | null>;
}

export function DocumentMetricsCard({ filters, state, keepParams }: DocumentMetricsCardProps) {
  const headingId = useId();

  return (
    <article
      aria-labelledby={headingId}
      className={`${CARD} flex min-h-36 min-w-0 flex-col gap-5 p-6 sm:p-8`}
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-[22px] font-bold text-texto">
          Documentos
        </h3>
        <p className="text-sm text-texto-suave">
          Muestra el estado actual de los documentos activos. Las fechas solo cambian «Cargados en
          el período».
        </p>
      </div>
      <DocumentMetricsContent filters={filters} state={state} keepParams={keepParams} />
    </article>
  );
}

function DocumentMetricsContent({ filters, state, keepParams = (href) => href }: DocumentMetricsCardProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <ScreenState kind="loading" label="Cargando las métricas de documentos…" />;
  }

  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMetricsError(state.error);
    return (
      <div>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-6 text-center">
            <Link
              href={keepParams(metricsHref({ ...filters, areaId: null }))}
              className={TEXT_LINK}
            >
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }

  if (!state.data) {
    return <p className="font-semibold text-texto">Todavía no disponible.</p>;
  }

  const { totals } = state.data;
  return (
    <>
      <MetricsFacts
        title="Estado actual"
        facts={[
          ['Activos', formatCount(totals.active)],
          ['Al día', formatCount(totals.upToDate)],
          ['Vencen pronto', formatCount(totals.dueSoon)],
          ['Vencidos', formatCount(totals.overdue)],
          ['Con error de procesamiento', formatCount(totals.processingFailed)],
        ]}
      />
      <MetricsFacts
        title={`Del ${formatDay(filters.from)} al ${formatDay(filters.to)}`}
        facts={[['Cargados en el período', formatCount(totals.uploaded)]]}
      />
    </>
  );
}
