'use client';

// The metrics of pair C (assistant and documents), behind the teamCMetrics port. Documents come
// from the API; the assistant, while its adapter is the empty one, says "Todavía no disponible."
// and what it will show: never a made-up number.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { metricsQuery, useApiResource } from '@/lib/api';
import { ERROR_TEXT } from '@/components/documents/design';
import { formatDuration } from '@/lib/executions/format';
import { teamCMetrics } from '@/lib/metrics';
import type { PanelFilters } from '@/lib/metrics/filters';
import { formatCount } from '@/lib/metrics/format';
import { DocumentMetricsCard } from './DocumentMetricsCard';

const usdFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' });

interface TeamCMetricsProps {
  filters: PanelFilters;
  // Without a session the documents are not asked for. Part of the key: switching users asks again.
  userId: string | null;
}

export function TeamCMetrics({ filters, userId }: TeamCMetricsProps) {
  const headingId = useId();
  const query = metricsQuery(filters);
  const assistant = useApiResource(`team-c-assistant${query}`, (signal) =>
    teamCMetrics.getAssistant(filters, signal),
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
          Las preparan los equipos de documentos y del asistente.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DocumentMetricsCard filters={filters} state={documents} />
        <TeamCCard
          title="Asistente"
          upcoming="Preguntas, preguntas sin respuesta, latencia y costo."
          resource={assistant}
          render={(data) => [
            ['Preguntas', formatCount(data.questions)],
            ['Sin respuesta', formatCount(data.unanswered)],
            ['Latencia (mediana)', formatDuration(data.latencyP50Ms)],
            ['Latencia (p95)', formatDuration(data.latencyP95Ms)],
            ['Tokens', formatCount(data.tokens)],
            ['Costo', usdFormat.format(data.costUsd)],
          ]}
        />
      </div>
    </section>
  );
}

interface TeamCCardProps<T> {
  title: string;
  // What the card will show once pair C delivers it.
  upcoming: string;
  resource: { status: string; data?: T | null };
  render: (data: T) => [string, string][];
}

// While pair C has not delivered it, the card keeps a dashed border: something still to come.
function TeamCCard<T>({ title, upcoming, resource, render }: TeamCCardProps<T>) {
  const headingId = useId();
  let body: ReactNode;
  if (resource.status === 'success' && resource.data) {
    body = (
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {render(resource.data).map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-sm font-semibold text-texto-suave">{label}</dt>
            <dd className="text-2xl font-extrabold text-bosque tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    );
  } else if (resource.status === 'success') {
    body = (
      <>
        <p className="font-semibold text-texto">Todavía no disponible.</p>
        <p className="text-sm text-texto-suave">Va a mostrar: {upcoming}</p>
      </>
    );
  } else if (resource.status === 'error') {
    body = (
      <p role="alert" className={ERROR_TEXT}>
        No pudimos cargar estas métricas.
      </p>
    );
  } else {
    body = <p className="text-sm text-texto-suave">Cargando…</p>;
  }

  return (
    <article
      aria-labelledby={headingId}
      className="flex min-h-36 min-w-0 flex-col gap-3 rounded-2xl border-2 border-dashed border-borde bg-blanco p-6 sm:p-8"
    >
      <h3 id={headingId} className="text-[22px] font-bold text-texto">
        {title}
      </h3>
      {body}
    </article>
  );
}
