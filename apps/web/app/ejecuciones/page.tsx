// /ejecuciones: choosing a procedure to execute step by step (HU12). Only EMPLOYEE: another role
// sees RequireRole's message and the picker is not even mounted. The API answers 403 anyway.
import type { Metadata } from 'next';
import { PageHeader } from '@/components/documents/design';
import { ProcedurePicker } from '@/components/executions/ProcedurePicker';
import { RequireRole } from '@/components/session/RequireRole';

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
      <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
        <ProcedurePicker />
      </RequireRole>
    </main>
  );
}
