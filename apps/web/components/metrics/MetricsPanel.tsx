'use client';

// Procedures metrics panel (HU38): filters, headline numbers, one card per procedure and the
// metrics of pair C. The API decides which procedures each role sees; the filters live in the
// address.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { CARD, TEXT_LINK } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMetricsError, getProcedureMetrics, metricsQuery, useApiResource } from '@/lib/api';
import type { ApiResource, ProceduresMetricsResponse } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { displayAreaName } from '@/lib/directory/areas-directory';
import {
  areaOptions,
  metricsHref,
  parseMetricsFilters,
  todayInCompany,
  withAreaHints,
} from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { useSession } from '@/lib/session';
import { MetricsFiltersForm } from './MetricsFiltersForm';
import { AreaMetricsSection } from './AreaMetricsSection';
import { FeatherIcon } from './icons';
import { MetricsSummary } from './MetricsSummary';
import { ProcedureTimeTable } from './ProcedureTimeTable';
import { TeamCMetrics } from './TeamCMetrics';

// A white card for the states of the section (error, empty), with the design's padding.
const STATE_CARD = `${CARD} px-6 sm:px-8`;

export function MetricsPanel() {
  const { user } = useSession();
  const today = todayInCompany();
  const filters = parseMetricsFilters(useSearchParams(), today);
  const query = metricsQuery(filters);

  // The key includes the user: switching test users asks again.
  const metrics = useApiResource(user ? `metrics:${user.id}${query}` : null, (signal) =>
    getProcedureMetrics(filters, signal),
  );
  const areas = useApiResource('metrics-areas', () => areasDirectory.listAreas());
  // Without the area names the panel still works: the selector offers only "Todas".
  const areaList = areas.status === 'success' ? areas.data : [];
  const isAdmin = user?.role === 'ADMIN';
  // The procedures per area come from the API's summary, which ignores the area filter: the
  // selector shows them also with an area chosen. A procedure with two areas counts in each.
  const counts =
    metrics.status === 'success'
      ? new Map(metrics.data.areaSummary.map((area) => [area.areaId, area.procedures]))
      : null;
  const options = withAreaHints(
    areaOptions(
      isAdmin,
      areaList,
      metrics.status === 'success' ? metrics.data.areaIds : undefined,
      filters.areaId,
    ),
    counts,
  );

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <MetricsFiltersForm
        key={metricsHref(filters)}
        filters={filters}
        areas={options}
        today={today}
      />
      <ProceduresSection
        filters={filters}
        areas={areaList}
        state={metrics}
        isAdmin={isAdmin}
      />
      {metrics.status === 'success' && metrics.data.totals.started > 0 && (
        <ProcedureDetails metrics={metrics.data} areas={areaList} areaId={filters.areaId} />
      )}
      <TeamCMetrics filters={filters} userId={user?.id ?? null} />
    </div>
  );
}

interface ProceduresSectionProps {
  filters: PanelFilters;
  areas: Area[];
  state: ApiResource<ProceduresMetricsResponse>;
  isAdmin: boolean;
}

function ProceduresSection({ filters, areas, state, isAdmin }: ProceduresSectionProps) {
  const headingId = useId();
  const chosen = areas.find((area) => area.id === filters.areaId);
  const areaName = filters.areaId
    ? chosen
      ? displayAreaName(chosen)
      : 'Área elegida'
    : isAdmin
      ? 'Todas las áreas'
      : 'Todas mis áreas';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-2xl font-bold text-texto">
          Resumen general
        </h2>
        <p className="text-texto-suave">{areaName}</p>
      </div>
      <ProceduresContent filters={filters} state={state} areaName={areaName} />
    </section>
  );
}

function ProceduresContent({
  filters,
  state,
  areaName,
}: Pick<ProceduresSectionProps, 'filters' | 'state'> & { areaName: string }) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando las métricas…">
        <MetricsSkeleton />
      </ScreenState>
    );
  }

  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMetricsError(state.error);
    return (
      <div className={STATE_CARD}>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-10 text-center">
            <Link
              href={metricsHref({ ...filters, areaId: null })}
              className={TEXT_LINK}
            >
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }

  const metrics = state.data;
  // A chosen area without executions: the design's dashed box with a big feather.
  if (metrics.totals.started === 0 && filters.areaId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-borde px-6 py-12 text-center">
        <FeatherIcon className="size-12 text-barro" />
        <p className="text-lg font-semibold text-texto">Sin ejecuciones en {areaName}</p>
        <p className="text-texto-suave">
          No hay procedimientos ejecutados en este período. Probá con otras fechas.
        </p>
      </div>
    );
  }

  if (metrics.totals.started === 0) {
    return (
      <div className={STATE_CARD}>
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-lg font-semibold text-texto">No hay ejecuciones en este período.</p>
          <p className="text-texto-suave">Probá con otras fechas u otra área.</p>
        </div>
      </div>
    );
  }

  return <MetricsSummary metrics={metrics} />;
}

// The sections below the summary, only when the period has executions.
function ProcedureDetails({
  metrics,
  areas,
  areaId,
}: {
  metrics: ProceduresMetricsResponse;
  areas: Area[];
  areaId: string | null;
}) {
  const areaNames = new Map(areas.map((area) => [area.id, displayAreaName(area)]));
  return (
    <>
      <ProcedureTimeTable procedures={metrics.procedures} areaNames={areaNames} />
      <AreaMetricsSection
        procedures={metrics.procedures}
        areas={areas}
        areaId={areaId}
        viewerAreaIds={metrics.areaIds}
      />
    </>
  );
}

export function MetricsSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="h-36 rounded-2xl bg-borde last:col-span-2 sm:last:col-span-1" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-borde" />
      <div className="h-56 rounded-2xl bg-borde" />
    </div>
  );
}
