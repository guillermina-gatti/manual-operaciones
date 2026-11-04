'use client';

// One procedure (HU09 and HU10): its draft, its steps and its areas. The API has no GET for
// procedures until HU11, so the data come from the copy kept in sessionStorage; every change the API
// accepts updates that copy.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useId } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { removeProcedure, saveProcedure, useStoredProcedures } from '@/lib/procedures/session-list';
import { useSession } from '@/lib/session';
import { DraftForm } from './DraftForm';
import { ProcedureAreasForm } from './ProcedureAreasForm';
import { StepsEditor } from './StepsEditor';

const BACK_LINK =
  'inline-flex min-h-11 items-center self-start rounded-md font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400';

export function ProcedureEditor() {
  const { user } = useSession();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const procedures = useStoredProcedures(user?.id ?? null);
  const baseId = useId();

  if (!user) return <ScreenState kind="loading" label="Cargando el procedimiento…" />;

  const procedure = procedures.find((item) => item.id === id);
  if (!procedure) {
    return (
      <ScreenState
        kind="empty"
        message="No tenemos los datos de este procedimiento en esta sesión del navegador. Todavía no hay un GET en la API para recuperarlos: llega con HU11."
        action={
          <Link href="/procedimientos" className={BACK_LINK}>
            Volver a procedimientos
          </Link>
        }
      />
    );
  }

  const leave = () => {
    removeProcedure(user.id, procedure.id);
    router.push('/procedimientos');
  };

  return (
    <div className="flex flex-col gap-8">
      <Link href="/procedimientos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
      </Link>

      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="break-words text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {procedure.title}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Versión {procedure.versionNumber} · borrador
        </p>
        <p
          role="note"
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
        >
          Estos datos son la copia de esta sesión del navegador: la API todavía no tiene un GET
          (llega con HU11). Si el procedimiento se cambia desde otro lugar, la copia puede quedar
          desactualizada.
        </p>
      </header>

      <section aria-labelledby={`${baseId}-draft`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-draft`} className="text-xl font-semibold">
          Borrador
        </h2>
        <DraftForm
          procedure={procedure}
          onChange={(next) => saveProcedure(user.id, next)}
          onGone={leave}
        />
      </section>

      <section aria-labelledby={`${baseId}-steps`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-steps`} className="text-xl font-semibold">
          Pasos
        </h2>
        <StepsEditor
          procedure={procedure}
          onChange={(next) => saveProcedure(user.id, next)}
          onGone={leave}
        />
      </section>

      <section aria-labelledby={`${baseId}-areas`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-areas`} className="text-xl font-semibold">
          Áreas
        </h2>
        <ProcedureAreasForm procedure={procedure} onChange={(next) => saveProcedure(user.id, next)} />
      </section>
    </div>
  );
}
