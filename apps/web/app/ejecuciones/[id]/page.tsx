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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Link
        href="/ejecuciones"
        className="inline-flex min-h-11 items-center self-start text-blue-700 hover:underline dark:text-blue-400"
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
  );
}
