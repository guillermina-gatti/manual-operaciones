'use client';

// The home of the procedures screens (HU09): the form to create one, and the list of the ones
// created in this browser session. The API has no GET for procedures until HU11, so the list is
// the local copy in sessionStorage, and the screen says so.
import Link from 'next/link';
import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { removeProcedure, useStoredProcedures } from '@/lib/procedures/session-list';
import type { StoredProcedure } from '@/lib/procedures/session-list';
import { useSession } from '@/lib/session';
import { CreateProcedureForm } from './CreateProcedureForm';

const NOTICE =
  'Esta lista muestra solo los procedimientos que creaste en esta sesión del navegador. Todavía no hay un listado en la API: llega con HU11.';

function summary(procedure: StoredProcedure): string {
  const steps = procedure.steps.length;
  const areas = procedure.areaIds.length;
  return [
    steps === 0 ? 'sin pasos' : `${steps} ${steps === 1 ? 'paso' : 'pasos'}`,
    areas === 0 ? 'sin áreas' : `${areas} ${areas === 1 ? 'área' : 'áreas'}`,
  ].join(' · ');
}

export function ProcedureList() {
  const { user } = useSession();
  const procedures = useStoredProcedures(user?.id ?? null);
  const baseId = useId();

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby={`${baseId}-create`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-create`} className="text-xl font-semibold">
          Crear un procedimiento
        </h2>
        <CreateProcedureForm />
      </section>

      <section aria-labelledby={`${baseId}-list`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-list`} className="text-xl font-semibold">
          Creados en esta sesión
        </h2>
        <p
          role="note"
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
        >
          {NOTICE}
        </p>

        {procedures.length === 0 ? (
          <ScreenState kind="empty" message="Todavía no creaste procedimientos en esta sesión." />
        ) : (
          <ul className="flex flex-col gap-4">
            {procedures.map((procedure) => (
              <li
                key={procedure.id}
                className="flex min-w-0 flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="break-words text-lg font-semibold">{procedure.title}</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Versión {procedure.versionNumber} · borrador
                  </p>
                  {procedure.description && (
                    <p className="break-words text-zinc-700 dark:text-zinc-300">
                      {procedure.description}
                    </p>
                  )}
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{summary(procedure)}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/procedimientos/${procedure.id}`}
                    className="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:text-zinc-950 dark:hover:bg-blue-400"
                  >
                    Abrir
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => user && removeProcedure(user.id, procedure.id)}
                  >
                    Quitar de la lista
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
