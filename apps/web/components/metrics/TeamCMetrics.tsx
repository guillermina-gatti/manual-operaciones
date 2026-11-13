'use client';

// The assistant and documents metrics, behind the teamCMetrics port: both come from the API, with
// the filters of the panel.
import { useId } from 'react';
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
  const headingId = useId();
  const query = metricsQuery(filters);
  const assistant = useApiResource(
    userId ? `team-c-assistant:${userId}${query}` : null,
    (signal) => teamCMetrics.getAssistant(filters, signal),
  );
  const documents = useApiResource(
    userId ? `team-c-documents:${userId}${query}` : null,
    (signal) => teamCMetrics.getDocuments(filters, signal),
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-bold text-texto">
          Documentos y asistente
        </h2>
        <p className="text-texto-suave">
          Cómo están los documentos y cómo le fue al asistente con las consultas.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DocumentMetricsCard filters={filters} state={documents} keepParams={keepParams} />
        <AssistantMetricsCard filters={filters} state={assistant} keepParams={keepParams} />
      </div>
    </section>
  );
}
