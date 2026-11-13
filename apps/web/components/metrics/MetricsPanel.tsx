'use client';

// Procedures metrics panel (HU38): the filters, always on top, and two tabs. "Procedimientos": the
// headline numbers, the time per procedure and the detail per area. "Documentos y asistente": the
// metrics of pair C, asked for only when that tab is open. The API decides which procedures each
// role sees; the filters and the tab live in the address.
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
import { previousPeriod } from '@/lib/metrics/comparison';
import { SECTION_PARAM, keepMetricsSection, parseMetricsSection, withMetricsSection } from '@/lib/metrics/section';
import { useSession } from '@/lib/session';
import { MetricsFiltersForm } from './MetricsFiltersForm';
import { AreaMetricsSection } from './AreaMetricsSection';
import { MetricsTabs } from './MetricsTabs';
import { ExportCsvButton } from './ExportCsvButton';
import type { ExportState } from './ExportCsvButton';
import { SectionHeading } from './SectionHeading';
import { MetricsSummary } from './MetricsSummary';
import type { PreviousTotals } from './MetricsSummary';
import { ProcedureTimeTable } from './ProcedureTimeTable';
import { TeamCMetrics, useTeamCMetrics } from './TeamCMetrics';
import type { TeamCResources } from './TeamCMetrics';
import { csvFileName, documentsAndAssistantCsv, proceduresCsv } from '@/lib/metrics/csv';
import type { MetricsSection } from '@/lib/metrics/section';

// A white card for the states of the section (error, empty), with the design's padding.
const STATE_CARD = `${CARD} px-6 sm:px-8`;

export function MetricsPanel() {
  const { user } = useSession();
  const today = todayInCompany();
  const params = useSearchParams();
  const filters = parseMetricsFilters(params, today);
  const query = metricsQuery(filters);
  const section = parseMetricsSection(params.get(SECTION_PARAM));
  // The filters and "Ver todas mis áreas" keep the tab, as it is written in the address.
  const keepSection = keepMetricsSection(params.get(SECTION_PARAM));

  // Both tabs ask for the procedures: the area selector of the filters takes from them the areas a
  // SUPERVISOR can choose and how many procedures each one has. The key includes the user:
  // switching test users asks again.
  const metrics = useApiResource(user ? `metrics:${user.id}${query}` : null, (signal) =>
    getProcedureMetrics(filters, signal),
  );
  // The period of the same length right before, with the same area, for "Resumen general". Apart
  // from the main one: if it fails or takes long, the summary shows without comparing.
  const previous = previousPeriod(filters.from, filters.to);
  const previousFilters = previous ? { ...filters, ...previous } : null;
  const previousMetrics = useApiResource(
    user && previousFilters && section === 'procedimientos'
      ? `metrics-previous:${user.id}${metricsQuery(previousFilters)}`
      : null,
    (signal) => getProcedureMetrics(previousFilters!, signal),
  );
  const previousTotals: PreviousTotals | null = !previous
    ? null
    : previousMetrics.status === 'success'
      ? { status: 'success', period: previous, totals: previousMetrics.data.totals }
      : previousMetrics.status === 'error'
        ? { status: 'error', period: previous }
        : { status: 'loading', period: previous };
  const areas = useApiResource('metrics-areas', () => areasDirectory.listAreas());
  // Without the area names the panel still works: the selector offers only "Todas".
  const areaList = areas.status === 'success' ? areas.data : [];
  const isAdmin = user?.role === 'ADMIN';
  // The metrics of the second tab, only while it is open.
  const teamC = useTeamCMetrics(filters, section === 'documentos' ? (user?.id ?? null) : null);
  const exportState = exportStateFor(section, filters, panelAreaName(filters, areaList, isAdmin), {
    metrics,
    areas: areaList,
    teamC,
  });
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
        keepParams={keepSection}
      />
      <MetricsTabs
        section={section}
        hrefFor={(tab) => withMetricsSection(metricsHref(filters), tab)}
        actions={<ExportCsvButton state={exportState} />}
      >
        {section === 'procedimientos' ? (
          <>
            <ProceduresSection
              filters={filters}
              areas={areaList}
              state={metrics}
              previous={previousTotals}
              isAdmin={isAdmin}
              keepSection={keepSection}
            />
            {metrics.status === 'success' && metrics.data.totals.started > 0 && (
              <ProcedureDetails
                metrics={metrics.data}
                areas={areaList}
                areaId={filters.areaId}
                filtersKey={metricsHref(filters)}
              />
            )}
          </>
        ) : (
          <TeamCMetrics
            filters={filters}
            resources={teamC}
            keepParams={keepSection}
            isAdmin={isAdmin}
          />
        )}
      </MetricsTabs>
    </div>
  );
}

// "Todas las áreas", "Todas mis áreas" or the name of the area of the filter.
function panelAreaName(filters: PanelFilters, areas: Area[], isAdmin: boolean): string {
  if (!filters.areaId) return isAdmin ? 'Todas las áreas' : 'Todas mis áreas';
  const chosen = areas.find((area) => area.id === filters.areaId);
  return chosen ? displayAreaName(chosen) : 'Área elegida';
}

// What "Exportar CSV" can do in the open tab: the file of what it shows, with the filters, or why
// there is nothing to export yet.
function exportStateFor(
  section: MetricsSection,
  filters: PanelFilters,
  areaName: string,
  {
    metrics,
    areas,
    teamC,
  }: {
    metrics: ApiResource<ProceduresMetricsResponse>;
    areas: Area[];
    teamC: TeamCResources;
  },
): ExportState {
  const loading = { status: 'unavailable', reason: 'Esperá a que carguen los datos.' } as const;
  const empty = { status: 'unavailable', reason: 'No hay datos para exportar con estos filtros.' } as const;
  const failed = {
    status: 'unavailable',
    reason: 'No se pudieron cargar los datos para exportar.',
  } as const;
  const context = () => ({ area: areaName, from: filters.from, to: filters.to, exportedAt: new Date() });
  const fileName = csvFileName(section, filters.from, filters.to);

  if (section === 'procedimientos') {
    if (metrics.status === 'error') return failed;
    if (metrics.status !== 'success') return loading;
    if (metrics.data.procedures.length === 0) return empty;
    const data = metrics.data;
    const names = new Map(areas.map((area) => [area.id, displayAreaName(area)]));
    return { status: 'ready', fileName, build: () => proceduresCsv(data, names, context()) };
  }

  const { documents, assistant } = teamC;
  const pending = [documents, assistant].some(
    (resource) => resource.status === 'loading' || resource.status === 'idle',
  );
  if (pending) return loading;
  const documentsData = documents.status === 'success' ? documents.data : null;
  const assistantData = assistant.status === 'success' ? assistant.data : null;
  if (!documentsData && !assistantData) {
    return documents.status === 'error' && assistant.status === 'error' ? failed : empty;
  }
  return {
    status: 'ready',
    fileName,
    build: () => documentsAndAssistantCsv(documentsData, assistantData, context()),
  };
}

interface ProceduresSectionProps {
  filters: PanelFilters;
  areas: Area[];
  state: ApiResource<ProceduresMetricsResponse>;
  previous: PreviousTotals | null;
  isAdmin: boolean;
  keepSection: (href: string) => string;
}

function ProceduresSection({
  filters,
  areas,
  state,
  previous,
  isAdmin,
  keepSection,
}: ProceduresSectionProps) {
  const headingId = useId();
  const areaName = panelAreaName(filters, areas, isAdmin);

  // With the numbers, the panel carries its own heading ("Resumen general · Todas las áreas").
  if (state.status === 'success') {
    return (
      <MetricsSummary
        metrics={state.data}
        areaName={areaName}
        areaChosen={Boolean(filters.areaId)}
        previous={previous}
      />
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionHeading id={headingId}>Resumen general</SectionHeading>
        <p className="text-texto-suave">{areaName}</p>
      </div>
      <ProceduresState filters={filters} state={state} keepSection={keepSection} />
    </section>
  );
}

// While the numbers load, or when they cannot be read.
function ProceduresState({
  filters,
  state,
  keepSection,
}: Pick<ProceduresSectionProps, 'filters' | 'state' | 'keepSection'>) {
  if (state.status === 'error') {
    const { message, canRetry, areaNotFound } = describeMetricsError(state.error);
    return (
      <div className={STATE_CARD}>
        <ScreenState kind="error" message={message} onRetry={canRetry ? state.reload : undefined} />
        {areaNotFound && (
          <p className="-mt-6 pb-10 text-center">
            <Link
              href={keepSection(metricsHref({ ...filters, areaId: null }))}
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
    <ScreenState kind="loading" label="Cargando las métricas…">
      <MetricsSkeleton />
    </ScreenState>
  );
}

// The sections below the summary, only when the period has executions.
function ProcedureDetails({
  metrics,
  areas,
  areaId,
  filtersKey,
}: {
  metrics: ProceduresMetricsResponse;
  areas: Area[];
  areaId: string | null;
  // The order of the time table starts again with other filters.
  filtersKey: string;
}) {
  // The chips say "(inactiva)" themselves; an area the directory does not send is taken as active.
  const areaRefs = new Map(
    areas.map((area) => [area.id, { id: area.id, name: area.name, isActive: area.isActive !== false }]),
  );
  return (
    <>
      <ProcedureTimeTable key={filtersKey} procedures={metrics.procedures} areas={areaRefs} />
      <AreaMetricsSection
        procedures={metrics.procedures}
        areas={areas}
        areaId={areaId}
        viewerAreaIds={metrics.areaIds}
      />
    </>
  );
}

// The shape of the tab: the summary panel, the table and an area card.
export function MetricsSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">
      <div className="h-56 rounded-3xl bg-borde lg:h-48" />
      <div className="h-72 rounded-[20px] bg-borde" />
      <div className="h-56 rounded-2xl bg-borde" />
    </div>
  );
}
