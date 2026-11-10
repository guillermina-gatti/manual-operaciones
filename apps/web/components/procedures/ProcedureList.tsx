'use client';

// The home of the procedures screens (HU09): the form to create one, and the list of the ones
// created in this browser session. The API has no GET for procedures until HU11, so the list is
// the local copy in sessionStorage, and the screen says so. It has no box of its own: the main of
// the page lays its parts out.
import { useId } from 'react';
import { LIST_PANEL } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import { removeProcedure, useStoredProcedures } from '@/lib/procedures/session-list';
import { useSession } from '@/lib/session';
import { CreateProcedureForm } from './CreateProcedureForm';
import { Notice } from './Notice';
import { ProcedureCard } from './ProcedureCard';

const NOTICE =
  'Todavía no hay un listado completo de procedimientos; por ahora se ven los que creaste en esta sesión del navegador.';
const SECTION_TITLE = 'text-xl font-bold';

export function ProcedureList() {
  const { user } = useSession();
  const procedures = useStoredProcedures(user?.id ?? null);
  const baseId = useId();

  return (
    <>
      <section aria-labelledby={`${baseId}-create`} className={`${LIST_PANEL} flex flex-col gap-5`}>
        <h2 id={`${baseId}-create`} className={SECTION_TITLE}>
          Crear un procedimiento
        </h2>
        <CreateProcedureForm />
      </section>

      <section aria-labelledby={`${baseId}-list`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-list`} className={SECTION_TITLE}>
          Creados en esta sesión
        </h2>
        <Notice tone="info" role="note">
          {NOTICE}
        </Notice>

        {procedures.length === 0 ? (
          <ScreenState kind="empty" message="Todavía no creaste procedimientos en esta sesión." />
        ) : (
          <ul className="grid gap-6 md:grid-cols-2">
            {procedures.map((procedure) => (
              <li key={procedure.id} className="min-w-0">
                <ProcedureCard
                  procedure={procedure}
                  onRemove={() => user && removeProcedure(user.id, procedure.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
