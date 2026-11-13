'use client';

// The assistant and documents metrics, behind the teamCMetrics port: both come from the API, with
// the filters of the panel.
import { metricsQuery, useApiResource } from '@/lib/api';
import { teamCMetrics } from '@/lib/metrics';
import type { PanelFilters } from '@/lib/metrics/filters';
import { AssistantMetricsCard } from './AssistantMetricsCard';
import { DocumentMetricsCard } from './DocumentMetricsCard';

interface TeamCMetricsProps {
  filters: PanelFilters;
  // Without a session nothing is asked for. Part of the key: switching users asks again.
  userId: string | null;
  // What the page adds to "Ver todas mis áreas" (the tab of /metricas).
  keepParams?: (href: string) => string;
}

export function TeamCMetrics({ filters, userId, keepParams }: TeamCMetricsProps) {
  const query = metricsQuery(filters);
  const assistant = useApiResource(
    userId ? `team-c-assistant:${userId}${query}` : null,
    (signal) => teamCMetrics.getAssistant(filters, signal),
  );
  const documents = useApiResource(
    userId ? `team-c-documents:${userId}${query}` : null,
    (signal) => teamCMetrics.getDocuments(filters, signal),
  );

  // The tab "Documentos y asistente" names the panel: each part carries its own title.
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <DocumentMetricsCard filters={filters} state={documents} keepParams={keepParams} />
      <AssistantMetricsCard filters={filters} state={assistant} keepParams={keepParams} />
    </div>
  );
}
