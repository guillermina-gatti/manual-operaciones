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
import { BACK_LINK, CARD_TITLE, Card, Notice, PageHeader } from './design';
import { MAX_STEPS, StepsEditor } from './StepsEditor';

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

      <PageHeader
        title={procedure.title}
        subtitle={`Versión ${procedure.versionNumber} · borrador`}
      />
      <Notice tone="info" role="note">
        Estos datos son la copia de esta sesión del navegador: la API todavía no tiene un GET
        (llega con HU11). Si el procedimiento se cambia desde otro lugar, la copia puede quedar
        desactualizada.
      </Notice>

      <Card aria-labelledby={`${baseId}-draft`}>
        <h2 id={`${baseId}-draft`} className={CARD_TITLE}>
          Borrador
        </h2>
        <DraftForm
          procedure={procedure}
          onChange={(next) => saveProcedure(user.id, next)}
          onGone={leave}
        />
      </Card>

      <Card aria-labelledby={`${baseId}-steps`}>
        <h2 id={`${baseId}-steps`} className={CARD_TITLE}>
          Pasos · {procedure.steps.length} de {MAX_STEPS}
        </h2>
        <p className="-mt-3 text-sm text-texto-suave">La numeración se acomoda sola.</p>
        <StepsEditor
          procedure={procedure}
          onChange={(next) => saveProcedure(user.id, next)}
          onGone={leave}
        />
      </Card>

      <Card aria-labelledby={`${baseId}-areas`}>
        <h2 id={`${baseId}-areas`} className={CARD_TITLE}>
          Áreas
        </h2>
        <ProcedureAreasForm procedure={procedure} onChange={(next) => saveProcedure(user.id, next)} />
      </Card>
    </div>
  );
}
