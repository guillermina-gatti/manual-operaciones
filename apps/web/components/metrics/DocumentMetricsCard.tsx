// "Documentos" of the metrics panel (HU38, GET /api/metrics/documents): six tiles with a stripe on
// their left. Almost every total is the current state of the active documents; the dates only
// change «Cargados en el período», and the section says so, so a period that barely moves the
// numbers does not look broken. Errors read like the procedures ones.
//
// The stripes are the colors of the states of /documentos (StatusDot and FreshnessBar of
// components/documents/design.tsx, all tokens): al día exito, vence pronto naranja, vencido and
// con error peligro. Activos and Cargados are only counts: bosque. A color never goes alone: each
// tile has its name.
import Link from 'next/link';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { TEXT_LINK } from '@/components/documents/design';
import { TABLE_FRAME } from '@/components/executions/activity-design';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMetricsError } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import type { DocumentMetrics } from '@/lib/metrics';
import { metricsHref } from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { formatShortPeriod } from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { TILE_STRIPE } from './metrics-design';
import { SectionHeading } from './SectionHeading';

interface DocumentMetricsCardProps {
  filters: PanelFilters;
  // What the page adds to "Ver todas mis áreas" (/metricas keeps its tab). By default nothing.
  keepParams?: (href: string) => string;
  state: ApiResource<DocumentMetrics | null>;
  // Under the tiles, inside the section: the lists of the documents due soon and overdue.
  children?: ReactNode;
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4';

export function DocumentMetricsCard({
  filters,
  state,
  keepParams,
  children,
}: DocumentMetricsCardProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading id={headingId}>Documentos</SectionHeading>
        <p className="text-texto-suave">
          Muestra el estado actual de los documentos activos. Las fechas solo cambian «Cargados en
          el período».
        </p>
      </div>
      <DocumentMetricsContent filters={filters} state={state} keepParams={keepParams} />
      {children}
    </section>
  );
}

function DocumentMetricsContent({
  filters,
  state,
  keepParams = (href) => href,
}: DocumentMetricsCardProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando las métricas de documentos…">
        <div aria-hidden="true" className={`${GRID} animate-pulse motion-reduce:animate-none`}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-32 rounded-[20px] bg-borde" />
          ))}
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

  if (!state.data) {
    return (
      <p className={`${TABLE_FRAME} px-6 py-8 font-semibold text-texto`}>Todavía no disponible.</p>
    );
  }

  const { totals } = state.data;
  return (
    <dl className={GRID}>
      <Tile label="Activos" value={totals.active} stripe="bg-bosque" />
      <Tile label="Al día" value={totals.upToDate} stripe="bg-exito" />
      <Tile label="Vencen pronto" value={totals.dueSoon} stripe="bg-naranja" />
      <Tile label="Vencidos" value={totals.overdue} stripe="bg-peligro" />
      <Tile
        label="Con error de procesamiento"
        value={totals.processingFailed}
        stripe="bg-peligro"
        // There is no list of the documents that failed to link to: only the tag.
        extra={
          totals.processingFailed > 0 && (
            <span className="inline-flex w-fit items-center rounded-md bg-durazno px-2 py-0.5 text-xs font-bold text-durazno-texto">
              Revisar
            </span>
          )
        }
      />
      <Tile
        label="Cargados en el período"
        value={totals.uploaded}
        stripe="bg-bosque"
        extra={
          <span className="text-sm text-texto-suave">{formatShortPeriod(filters.from, filters.to)}</span>
        }
      />
    </dl>
  );
}

function Tile({
  label,
  value,
  stripe,
  extra,
}: {
  label: string;
  value: number;
  // The color of its state (a token): decorative, the label says it.
  stripe: string;
  // Under the number, inside its dd: the tag or the dates.
  extra?: ReactNode;
}) {
  return (
    <div
      className={`${TABLE_FRAME} relative flex min-w-0 flex-col gap-1 overflow-hidden py-4 pr-4 pl-6`}
    >
      <span aria-hidden="true" data-testid="tile-stripe" className={`${TILE_STRIPE} ${stripe}`} />
      <dt className="text-sm font-bold break-words text-texto">{label}</dt>
      <dd className="flex flex-col items-start gap-1">
        <span className="text-[34px] leading-tight font-extrabold text-bosque tabular-nums">
          {formatCount(value)}
        </span>
        {extra}
      </dd>
    </div>
  );
}
