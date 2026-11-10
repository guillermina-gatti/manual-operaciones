'use client';

// The home of the procedures screens (HU09): the form to create one, and the list of the ones
// created in this browser session. The API has no GET for procedures until HU11, so the list is
// the local copy in sessionStorage, and the screen says so.
import Link from 'next/link';
import { useId } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { removeProcedure, useStoredProcedures } from '@/lib/procedures/session-list';
import type { StoredProcedure } from '@/lib/procedures/session-list';
import { useSession } from '@/lib/session';
import { CreateProcedureForm } from './CreateProcedureForm';
import {
  AreaChip,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD_TITLE,
  Card,
} from './design';
import { Notice } from './Notice';

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
    <div className="flex flex-col gap-8">
      <Card aria-labelledby={`${baseId}-create`}>
        <h2 id={`${baseId}-create`} className={CARD_TITLE}>
          Crear un procedimiento
        </h2>
        <CreateProcedureForm />
      </Card>

      <section aria-labelledby={`${baseId}-list`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-list`} className={CARD_TITLE}>
          Creados en esta sesión
        </h2>
        <Notice tone="info" role="note">
          {NOTICE}
        </Notice>

        {procedures.length === 0 ? (
          <ScreenState kind="empty" message="Todavía no creaste procedimientos en esta sesión." />
        ) : (
          <ul className="flex flex-col gap-6">
            {procedures.map((procedure) => (
              <li key={procedure.id} className="min-w-0">
                <Card className="gap-4 p-5 sm:p-6">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="break-words text-xl font-bold">{procedure.title}</h3>
                    <p className="text-sm text-texto-suave">
                      Versión {procedure.versionNumber} · borrador
                    </p>
                    {procedure.description && (
                      <p className="break-words">{procedure.description}</p>
                    )}
                    <p className="flex flex-wrap items-center gap-2">
                      <AreaChip>{summary(procedure)}</AreaChip>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/procedimientos/${procedure.id}`} className={BUTTON_PRIMARY}>
                      Abrir
                    </Link>
                    <button
                      type="button"
                      className={BUTTON_SECONDARY}
                      onClick={() => user && removeProcedure(user.id, procedure.id)}
                    >
                      Quitar de la lista
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
