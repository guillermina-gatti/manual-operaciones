'use client';

// Procedures metrics panel (HU38): filters, headline numbers, one card per procedure and the
// metrics of pair C. The API decides which procedures each role sees; the filters live in the
// address.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMetricsError, getProcedureMetrics, metricsQuery, useApiResource } from '@/lib/api';
import type { ApiResource, ProceduresMetricsResponse } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { formatReviewDate as formatDay } from '@/lib/documents/format';
import {
  areaOptions,
  metricsHref,
  parseMetricsFilters,
  todayInCompany,
} from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { useSession } from '@/lib/session';
import { MetricsFiltersForm } from './MetricsFiltersForm';
import { MetricsSummary } from './MetricsSummary';
import { ProcedureMetricsCard } from './ProcedureMetricsCard';
import { TeamCMetrics } from './TeamCMetrics';

const CARD =
  'rounded-xl border border-zinc-200 bg-white px-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900';

export function MetricsPanel() {
  const { user } = useSession();
  const filters = parseMetricsFilters(useSearchParams(), todayInCompany());
  const query = metricsQuery(filters);

  // The key includes the user: switching test users asks again.
  const metrics = useApiResource(user ? `metrics:${user.id}${query}` : null, (signal) =>
    getProcedureMetrics(filters, signal),
  );
  const areas = useApiResource('metrics-areas', () => areasDirectory.listAreas());
  // Without the area names the panel still works: the selector offers only "Todas".
  const areaList = areas.status === 'success' ? areas.data : [];
  const isAdmin = user?.role === 'ADMIN';
  const options = areaOptions(
    isAdmin,
    areaList,
    metrics.status === 'success' ? metrics.data.areaIds : undefined,
    filters.areaId,
  );

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <MetricsFiltersForm key={metricsHref(filters)} filters={filters} areas={options} />
      <ProceduresSection
        filters={filters}
        areas={areaList}
        state={metrics}
        isAdmin={isAdmin}
      />
      <TeamCMetrics filters={filters} />
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
  const areaName = filters.areaId
    ? (areas.find((area) => area.id === filters.areaId)?.name ?? 'el área elegida')
    : isAdmin
      ? 'todas las áreas'
      : 'tus áreas';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Ejecuciones de procedimientos
        </h2>
        <p className="text-zinc-600 dark:text-zinc-300">
          Del {formatDay(filters.from)} al {formatDay(filters.to)}, en {areaName}.
        </p>
      </div>
      <ProceduresContent filters={filters} areas={areas} state={state} />
    </section>
  );
}

function ProceduresContent({ filters, areas, state }: Omit<ProceduresSectionProps, 'isAdmin'>) {
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
      <div className={CARD}>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-10 text-center">
            <Link
              href={metricsHref({ ...filters, areaId: null })}
              className="font-medium text-blue-700 underline dark:text-blue-300"
            >
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }

  const metrics = state.data;
  if (metrics.totals.started === 0) {
    return (
      <div className={CARD}>
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            No hay ejecuciones en este período.
          </p>
          <p className="text-zinc-600 dark:text-zinc-300">Probá con otras fechas u otra área.</p>
        </div>
      </div>
    );
  }

  const areaNames = new Map(areas.map((area) => [area.id, area.name]));
  return (
    <>
      <MetricsSummary metrics={metrics} />
      <div className="flex flex-col gap-6">
        {metrics.procedures.map((procedure) => (
          <ProcedureMetricsCard
            key={procedure.procedureId}
            procedure={procedure}
            areaNames={areaNames}
          />
        ))}
      </div>
    </>
  );
}

export function MetricsSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="h-28 rounded-xl bg-zinc-200 last:col-span-2 sm:last:col-span-1 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-56 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
