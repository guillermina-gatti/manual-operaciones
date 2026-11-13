'use client';

// The employee's own activity, in this order: what they can resume (every execution in progress,
// whatever the filters), the filters of /metricas (area and period, in the address), the summary of
// their executions in the period and their procedures. Only their data: the API takes the user from
// the session.
//
// "Para retomar" never depends on the filters. GET /metrics/me does not limit it by period, but it
// does by area: with an area chosen, the panel asks once more without it, and takes "resume" from
// there. Without an area, the same answer serves both and there is no second request.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { CARD, TEXT_LINK } from '@/components/documents/design';
import { MetricsFiltersForm } from '@/components/metrics/MetricsFiltersForm';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeMyMetricsError, getMyMetrics, metricsQuery, useApiResource } from '@/lib/api';
import type { ApiResource, DocumentReference, MyMetricsResponse } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import { MY_ACTIVITY_PATH, areasByProcedure } from '@/lib/executions/my-activity';
import { VIEW_PARAM, parseExecutionsView, withExecutionsView } from '@/lib/executions/view';
import { areaOptions, metricsHref, parseMetricsFilters, todayInCompany, withAreaHints } from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { useSession } from '@/lib/session';
import { MySummaryHero } from './MySummaryHero';
import { RecentProceduresTable } from './RecentProceduresTable';
import { ResumeList } from './ResumeList';

// A white card for the states of a section (error), with the design's padding.
const STATE_CARD = `${CARD} px-6 sm:px-8`;

export function MyActivityPanel() {
  const { user } = useSession();
  const today = todayInCompany();
  const searchParams = useSearchParams();
  const filters = parseMetricsFilters(searchParams, today);
  // The view of "Para retomar", the same as the picker of /ejecuciones.
  const view = parseExecutionsView(searchParams.get(VIEW_PARAM));
  // Applying or clearing a filter keeps the view; Tarjetas writes nothing.
  const keepView = (href: string) => withExecutionsView(href, view);
  const query = metricsQuery(filters);

  // The key includes the user: switching test users asks again.
  const metrics = useApiResource(user ? `my-metrics:${user.id}${query}` : null, (signal) =>
    getMyMetrics(filters, signal),
  );
  // With an area chosen, "Para retomar" comes from an answer without it (see above).
  const ownResume = useApiResource(
    user && filters.areaId ? `my-resume:${user.id}` : null,
    (signal) => getMyMetrics({}, signal),
  );
  const resumeSource = filters.areaId ? ownResume : metrics;
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
  // The procedures of both answers give the area chips of "Para retomar".
  const knownProcedures = [metrics, ownResume].flatMap((resource) =>
    resource.status === 'success' ? resource.data.procedures : [],
  );

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <ResumeSection
        state={resumeSource}
        // Without an area, an error of the only answer is already said by the summary.
        showError={Boolean(filters.areaId)}
        view={view}
        areas={areasByProcedure(knownProcedures, areaList)}
      />
      <MetricsFiltersForm
        key={metricsHref(filters, MY_ACTIVITY_PATH)}
        filters={filters}
        areas={options}
        today={today}
        path={MY_ACTIVITY_PATH}
        keepParams={keepView}
      />
      <SummarySection filters={filters} state={metrics} keepView={keepView} />
      {metrics.status === 'success' && metrics.data.procedures.length > 0 && (
        <RecentProceduresTable
          // Other filters start the order of the table again.
          key={metricsHref(filters, MY_ACTIVITY_PATH)}
          procedures={metrics.data.procedures}
          staleAfterHours={metrics.data.staleAfterHours}
          areas={
            new Map<string, DocumentReference>(
              areaList.map((area) => [
                area.id,
                { id: area.id, name: area.name, isActive: area.isActive !== false },
              ]),
            )
          }
        />
      )}
    </div>
  );
}

interface ResumeSectionProps {
  state: ApiResource<MyMetricsResponse>;
  showError: boolean;
  view: ReturnType<typeof parseExecutionsView>;
  areas: ReadonlyMap<string, DocumentReference[]>;
}

function ResumeSection({ state, showError, view, areas }: ResumeSectionProps) {
  if (state.status === 'success') {
    return (
      <ResumeList
        items={state.data.resume}
        staleAfterHours={state.data.staleAfterHours}
        view={view}
        areasByProcedure={areas}
      />
    );
  }
  if (state.status === 'error') {
    if (!showError) return null;
    const { message, canRetry } = describeMyMetricsError(state.error);
    return (
      <ResumeList
        items={[]}
        staleAfterHours={0}
        error={{ message, onRetry: canRetry ? state.reload : undefined }}
      />
    );
  }
  return <ResumeList items={[]} staleAfterHours={0} loading />;
}

interface SectionProps {
  filters: PanelFilters;
  state: ApiResource<MyMetricsResponse>;
  keepView: (href: string) => string;
}

// The hero carries its own heading ("Tu resumen · 1 nov – 13 nov"). While it loads or with an
// error, the heading goes above the state.
function SummarySection({ filters, state, keepView }: SectionProps) {
  const headingId = useId();
  if (state.status === 'success') {
    return (
      <div className="flex flex-col gap-3">
        <MySummaryHero
          totals={state.data.totals}
          staleAfterHours={state.data.staleAfterHours}
          from={filters.from}
          to={filters.to}
        />
        {state.data.totals.started > 0 && (
          <p className="text-sm text-texto-suave">
            En curso: con avance en las últimas {state.data.staleAfterHours} h. Las que llevan más
            tiempo sin avanzar no se cierran: las podés retomar.
          </p>
        )}
      </div>
    );
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <h2 id={headingId} className="text-2xl font-bold text-texto">
        Tu resumen
      </h2>
      <SummaryState filters={filters} state={state} keepView={keepView} />
    </section>
  );
}

function SummaryState({ filters, state, keepView }: SectionProps) {
  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMyMetricsError(state.error);
    return (
      <div className={STATE_CARD}>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-10 text-center">
            <Link
              href={keepView(metricsHref({ ...filters, areaId: null }, MY_ACTIVITY_PATH))}
              className={TEXT_LINK}
            >
              Ver todas mis áreas
            </Link>
          </p>
        )}
      </div>
    );
  }
  return (
    <ScreenState kind="loading" label="Cargando tu actividad…">
      <div aria-hidden="true" className="h-56 animate-pulse rounded-3xl bg-borde motion-reduce:animate-none lg:h-48" />
    </ScreenState>
  );
}

// The whole page while it loads (the fallback of the page): the same blocks, in the same order.
export function MyActivitySkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-10 motion-reduce:animate-none">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <div className="h-48 rounded-2xl bg-borde" />
        <div className="h-48 rounded-2xl bg-borde max-md:hidden" />
      </div>
      <div className="h-44 rounded-2xl bg-borde" />
      <div className="h-56 rounded-3xl bg-borde lg:h-48" />
      <div className="h-64 rounded-[20px] bg-borde" />
    </div>
  );
}
