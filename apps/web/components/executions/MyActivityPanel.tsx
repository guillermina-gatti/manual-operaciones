'use client';

// The employee's own activity: the filters of /metricas (area and period, in the address), the
// summary of their executions and the ones they can resume (of any date). Only their data: the
// API takes the user from the session.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { CARD, TEXT_LINK } from '@/components/documents/design';
import { MetricsFiltersForm } from '@/components/metrics/MetricsFiltersForm';
import { MetricTiles } from '@/components/metrics/MetricTiles';
import type { MetricTile } from '@/components/metrics/MetricTiles';
import { ChartIcon, CheckIcon, ClockIcon, CrossIcon, TimerIcon } from '@/components/metrics/icons';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMyMetricsError, getMyMetrics, metricsQuery, useApiResource } from '@/lib/api';
import type { ApiResource, MyMetricsResponse } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import { formatDuration } from '@/lib/executions/format';
import { MY_ACTIVITY_PATH, staleLabel } from '@/lib/executions/my-activity';
import {
  areaOptions,
  metricsHref,
  parseMetricsFilters,
  todayInCompany,
  withAreaHints,
} from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { outcomeShares } from '@/lib/metrics/summary';
import { useSession } from '@/lib/session';
import { ResumeList } from './ResumeList';

// A white card for the states of a section (error, empty), with the design's padding.
const STATE_CARD = `${CARD} px-6 sm:px-8`;

export function MyActivityPanel() {
  const { user } = useSession();
  const today = todayInCompany();
  const filters = parseMetricsFilters(useSearchParams(), today);
  const query = metricsQuery(filters);

  // The key includes the user: switching test users asks again.
  const metrics = useApiResource(user ? `my-metrics:${user.id}${query}` : null, (signal) =>
    getMyMetrics(filters, signal),
  );
  const areas = useApiResource('my-metrics-areas', () => areasDirectory.listAreas());
  // Without the area names the page still works: the selector offers only "Todas mis áreas".
  const areaList = areas.status === 'success' ? areas.data : [];
  const options = withAreaHints(
    areaOptions(
      false,
      areaList,
      metrics.status === 'success' ? metrics.data.areaIds : undefined,
      filters.areaId,
    ),
    null,
  );

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <MetricsFiltersForm
        key={metricsHref(filters, MY_ACTIVITY_PATH)}
        filters={filters}
        areas={options}
        today={today}
        path={MY_ACTIVITY_PATH}
      />
      <SummarySection filters={filters} state={metrics} />
      {metrics.status === 'success' && (
        <ResumeList
          items={metrics.data.resume}
          staleAfterHours={metrics.data.staleAfterHours}
        />
      )}
    </div>
  );
}

interface SectionProps {
  filters: PanelFilters;
  state: ApiResource<MyMetricsResponse>;
}

function SummarySection({ filters, state }: SectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <h2 id={headingId} className="text-2xl font-bold text-texto">
        Tu resumen
      </h2>
      <SummaryContent filters={filters} state={state} />
    </section>
  );
}

function SummaryContent({ filters, state }: SectionProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando tu actividad…">
        <MyActivitySkeleton />
      </ScreenState>
    );
  }

  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMyMetricsError(state.error);
    return (
      <div className={STATE_CARD}>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-10 text-center">
            <Link
              href={metricsHref({ ...filters, areaId: null }, MY_ACTIVITY_PATH)}
              className={TEXT_LINK}
            >
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }

  if (state.data.totals.started === 0) {
    return (
      <div className={STATE_CARD}>
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-lg font-semibold text-texto">
            No empezaste procedimientos en este período.
          </p>
          <p className="text-texto-suave">Probá con otras fechas u otra área.</p>
        </div>
      </div>
    );
  }

  return <MySummary metrics={state.data} />;
}

function MySummary({ metrics }: { metrics: MyMetricsResponse }) {
  const { totals, staleAfterHours } = metrics;
  const shares = outcomeShares(totals);
  const ofTotal = (share: number | null) => `${formatPercent(share)} del total`;
  const tiles: MetricTile[] = [
    {
      label: 'Empezadas',
      icon: <ChartIcon />,
      value: formatCount(totals.started),
      hint: 'en el período elegido',
    },
    {
      label: 'Completadas',
      icon: <CheckIcon />,
      value: formatCount(totals.completed),
      hint: ofTotal(shares.completed),
      hintClass: 'font-semibold text-chip-area-texto',
    },
    {
      label: 'En curso',
      icon: <ClockIcon />,
      value: formatCount(totals.inProgress),
      hint: ofTotal(shares.inProgress),
      hintClass: 'font-semibold text-texto',
    },
    {
      // What the API counts as abandoned: said as what it is, never "abandonadas".
      label: staleLabel(staleAfterHours),
      icon: <CrossIcon />,
      value: formatCount(totals.abandoned),
      hint: ofTotal(shares.abandoned),
      hintClass: 'font-semibold text-durazno-texto',
    },
    {
      label: 'Tu tiempo medio',
      icon: <TimerIcon />,
      value: formatDuration(totals.avgCompletionMs),
      hint: 'por ejecución completada',
      small: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <MetricTiles tiles={tiles} />
      <p className="text-sm text-texto-suave">
        En curso: con avance en las últimas {staleAfterHours} h. Las que llevan más tiempo sin
        avanzar no se cierran: las podés retomar.
      </p>
    </div>
  );
}

export function MyActivitySkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="h-36 rounded-2xl bg-borde last:col-span-2 sm:last:col-span-1" />
        ))}
      </div>
      <div className="h-56 rounded-2xl bg-borde" />
    </div>
  );
}
