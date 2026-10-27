'use client';

// The metrics of pair C (assistant and documents), behind the teamCMetrics port. While the
// adapter is the empty one, each card says "Todavía no disponible." and what it will show:
// never a made-up number.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { metricsQuery, useApiResource } from '@/lib/api';
import type { MetricsFilters } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { teamCMetrics } from '@/lib/metrics';
import { formatCount } from '@/lib/metrics/format';

const usdFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' });

export function TeamCMetrics({ filters }: { filters: MetricsFilters }) {
  const headingId = useId();
  const query = metricsQuery(filters);
  const assistant = useApiResource(`team-c-assistant${query}`, (signal) =>
    teamCMetrics.getAssistant(filters, signal),
  );
  const documents = useApiResource(`team-c-documents${query}`, (signal) =>
    teamCMetrics.getDocuments(filters, signal),
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Asistente y documentos
        </h2>
        <p className="text-zinc-600 dark:text-zinc-300">
          Las preparan los equipos del asistente y de documentos.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        <TeamCCard
          title="Documentos"
          upcoming="Documentos activos, consultados y con error de procesamiento."
          resource={documents}
          render={(data) => [
            ['Activos', formatCount(data.active)],
            ['Consultados', formatCount(data.consulted)],
            ['Con error de procesamiento', formatCount(data.processingFailed)],
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

function TeamCCard<T>({ title, upcoming, resource, render }: TeamCCardProps<T>) {
  let body: ReactNode;
  if (resource.status === 'success' && resource.data) {
    body = (
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {render(resource.data).map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</dd>
          </div>
        ))}
      </dl>
    );
  } else if (resource.status === 'success') {
    body = (
      <>
        <p className="font-medium text-zinc-800 dark:text-zinc-200">Todavía no disponible.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Va a mostrar: {upcoming}</p>
      </>
    );
  } else if (resource.status === 'error') {
    body = (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        No pudimos cargar estas métricas.
      </p>
    );
  } else {
    body = <p className="text-sm text-zinc-600 dark:text-zinc-400">Cargando…</p>;
  }

  return (
    <article className="flex min-h-36 flex-col gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/70 p-5 dark:border-zinc-700 dark:bg-zinc-900/60">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      {body}
    </article>
  );
}
