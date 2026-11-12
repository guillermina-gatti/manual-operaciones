// /ejecuciones: choosing a procedure to execute step by step (HU12). Only EMPLOYEE: another role
// sees RequireRole's message and the picker is not even mounted. The API answers 403 anyway.
// "Mi actividad" is reached from the home page, not from here. The view (?vista=) uses
// useSearchParams, so the picker goes inside a <Suspense>.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/documents/design';
import { PickerSkeleton, ProcedurePicker } from '@/components/executions/ProcedurePicker';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Ejecutar un procedimiento · Manual de operaciones',
};

export default function EjecucionesPage() {
  return (
    // The same frame as /documentos and /metricas: the app background and a centered column.
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <PageHeader
        title="Ejecutar un procedimiento"
        subtitle="Elegí un procedimiento para empezarlo, o para seguir donde lo dejaste."
      />
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando los procedimientos…">
            <PickerSkeleton />
          </ScreenState>
        }
      >
        <RequireRole
          role="EMPLOYEE"
          deniedMessage="Solo los empleados pueden ejecutar procedimientos."
        >
          <ProcedurePicker />
        </RequireRole>
      </Suspense>
    </main>
  );
}
