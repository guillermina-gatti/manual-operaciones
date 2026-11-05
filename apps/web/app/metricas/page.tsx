// /metricas: procedures metrics panel (HU38). Only ADMIN (every area) and SUPERVISOR (their
// areas): another role sees MetricsAccess's message and the panel is not even mounted. The API
// answers 403 anyway. The filters use useSearchParams, so the panel goes inside a <Suspense>.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/documents/design';
import { MetricsAccess } from '@/components/metrics/MetricsAccess';
import { MetricsPanel, MetricsSkeleton } from '@/components/metrics/MetricsPanel';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Métricas · Manual de operaciones',
};

export default function MetricasPage() {
  return (
    // The same frame as /documentos: the app background, a centered column and the big title.
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <PageHeader
        title="Métricas de uso"
        subtitle="Cómo se están ejecutando los procedimientos y cuánto tardan, en cada área."
      />
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando las métricas…">
            <MetricsSkeleton />
          </ScreenState>
        }
      >
        <MetricsAccess>
          <MetricsPanel />
        </MetricsAccess>
      </Suspense>
    </main>
  );
}
