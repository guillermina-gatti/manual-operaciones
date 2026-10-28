// /metricas: procedures metrics panel (HU38). Only ADMIN (every area) and SUPERVISOR (their
// areas): another role sees MetricsAccess's message and the panel is not even mounted. The API
// answers 403 anyway. The filters use useSearchParams, so the panel goes inside a <Suspense>.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MetricsAccess } from '@/components/metrics/MetricsAccess';
import { MetricsPanel, MetricsSkeleton } from '@/components/metrics/MetricsPanel';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Métricas · Manual de operaciones',
};

export default function MetricasPage() {
  return (
    // The same soft background as /ejecuciones, so the white cards stand out.
    <div className="flex-1 bg-zinc-50 dark:bg-transparent">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Métricas de procedimientos
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
            Cuántas veces se ejecutó cada procedimiento, cuánto lleva cada paso y dónde se
            abandona.
          </p>
        </div>
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
    </div>
  );
}
