'use client';

// One procedure (HU09 and HU10): its draft, its steps and its areas. The API has no GET for
// procedures until HU11, so the data come from the copy kept in sessionStorage; every change the API
// accepts updates that copy. It has no box of its own: the main of the page lays its parts out.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useId } from 'react';
import { BACK_LINK, HINT } from '@/components/documents/design';
import { LIST_PANEL, PageHeader } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import { removeProcedure, saveProcedure, useStoredProcedures } from '@/lib/procedures/session-list';
import { useSession } from '@/lib/session';
import { DraftForm } from './DraftForm';
import { Notice } from './Notice';
import { ProcedureAreasForm } from './ProcedureAreasForm';
import { MAX_STEPS, StepsEditor } from './StepsEditor';

const SECTION = `${LIST_PANEL} flex min-w-0 flex-col gap-5`;
const SECTION_TITLE = 'text-xl font-bold';

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
  const update = (next: typeof procedure) => saveProcedure(user.id, next);

  return (
    <>
      <Link href="/procedimientos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
      </Link>

      <PageHeader wrap title={procedure.title} subtitle={`Versión ${procedure.versionNumber} · borrador`} />
      <Notice tone="info" role="note">
        Estos datos son la copia de esta sesión del navegador: la API todavía no tiene un GET (llega
        con HU11). Si el procedimiento se cambia desde otro lugar, la copia puede quedar
        desactualizada.
      </Notice>

      <section aria-labelledby={`${baseId}-draft`} className={SECTION}>
        <h2 id={`${baseId}-draft`} className={SECTION_TITLE}>
          Borrador
        </h2>
        <DraftForm procedure={procedure} onChange={update} onGone={leave} />
      </section>

      <section aria-labelledby={`${baseId}-steps`} className={SECTION}>
        <h2 id={`${baseId}-steps`} className={SECTION_TITLE}>
          Pasos · {procedure.steps.length} de {MAX_STEPS}
        </h2>
        <p className={`${HINT} -mt-3`}>La numeración se acomoda sola.</p>
        <StepsEditor procedure={procedure} onChange={update} onGone={leave} />
      </section>

      <section aria-labelledby={`${baseId}-areas`} className={SECTION}>
        <h2 id={`${baseId}-areas`} className={SECTION_TITLE}>
          Áreas
        </h2>
        <ProcedureAreasForm procedure={procedure} onChange={update} />
      </section>
    </>
  );
}
