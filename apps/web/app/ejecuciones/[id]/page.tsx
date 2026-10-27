// /ejecuciones/[id]: an execution, step by step (HU12). Only EMPLOYEE; the API answers 403 anyway.
// A server component without data: the execution is requested from the browser. Without
// generateStaticParams the id is not known at build time, so useParams has to be inside a
// <Suspense> (cacheComponents).
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ExecutionSkeleton, ExecutionView } from '@/components/executions/ExecutionView';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Ejecución · Manual de operaciones',
};

export default function EjecucionPage() {
  return (
    // A soft background in light mode, so the white cards stand out; in dark mode, the page's own.
    <div className="flex-1 bg-zinc-50 dark:bg-transparent">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/ejecuciones"
          className="inline-flex min-h-11 items-center self-start rounded-md font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400"
        >
          <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
        </Link>
        <Suspense
          fallback={
            <ScreenState kind="loading" label="Cargando la ejecución…">
              <ExecutionSkeleton />
            </ScreenState>
          }
        >
          <RequireRole
            role="EMPLOYEE"
            deniedMessage="Solo los empleados pueden ejecutar procedimientos."
          >
            <ExecutionView />
          </RequireRole>
        </Suspense>
      </main>
    </div>
  );
}
