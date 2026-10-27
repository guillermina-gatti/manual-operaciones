// /ejecuciones: choosing a procedure to execute step by step (HU12). Only EMPLOYEE: another role
// sees RequireRole's message and the picker is not even mounted. The API answers 403 anyway.
import type { Metadata } from 'next';
import { ProcedurePicker } from '@/components/executions/ProcedurePicker';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Ejecutar un procedimiento · Manual de operaciones',
};

export default function EjecucionesPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Ejecutar un procedimiento</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Elegí un procedimiento para empezarlo, o para seguir donde lo dejaste.
        </p>
      </div>
      <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
        <ProcedurePicker />
      </RequireRole>
    </main>
  );
}
