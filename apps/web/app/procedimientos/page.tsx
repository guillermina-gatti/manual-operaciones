// /procedimientos: test screens for HU09 and HU10 (create a procedure and edit its draft). Only ADMIN:
// another role sees RequireRole's message and the screen is not even mounted. The API answers 403 anyway.
import type { Metadata } from 'next';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Procedimientos · Manual de operaciones',
};

export default function ProcedimientosPage() {
  return (
    // A soft background in light mode, so the white cards stand out; in dark mode, the page's own.
    <div className="flex-1 bg-zinc-50 dark:bg-transparent">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Procedimientos
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
            Pantallas de prueba para crear un procedimiento y editar su borrador, sus pasos y sus
            áreas.
          </p>
        </div>
        <RequireRole
          role="ADMIN"
          deniedMessage="Solo un administrador puede crear y editar procedimientos."
        >
          <ProcedureList />
        </RequireRole>
      </main>
    </div>
  );
}
