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
    // A soft background in light mode, so the white cards stand out; in dark mode, the page's own.
    <div className="flex-1 bg-zinc-50 dark:bg-transparent">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Ejecutar un procedimiento
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
            Elegí un procedimiento para empezarlo, o para seguir donde lo dejaste.
          </p>
        </div>
        <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
          <ProcedurePicker />
        </RequireRole>
      </main>
    </div>
  );
}
