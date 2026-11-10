'use client';

// One procedure (HU09, HU10 and HU32): its draft, its steps, its areas and its versions. The API has
// no GET for procedures until HU11, so the data come from the copy kept in sessionStorage; every
// change the API accepts updates that copy. If the version of the copy is no longer a draft, it is
// shown read-only. It has no box of its own: the main of the page lays its parts out.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useId } from 'react';
import { BACK_LINK } from '@/components/documents/design';
import { PageHeader } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import type { VersionDetail } from '@/lib/procedures';
import { removeProcedure, saveProcedure, useStoredProcedures } from '@/lib/procedures/session-list';
import { withDraftVersion } from '@/lib/procedures/snapshot';
import { versionSummary } from '@/lib/procedures/versions';
import { useSession } from '@/lib/session';
import { CompareVersions } from './CompareVersions';
import { DraftSections } from './DraftSections';
import { SECTION, SECTION_TITLE } from './design';
import { Notice } from './Notice';
import { ProcedureAreasForm } from './ProcedureAreasForm';
import { useVersions } from './useVersions';
import { VersionActions } from './VersionActions';
import { VersionReadOnly } from './VersionReadOnly';
import { VersionsSection } from './VersionsSection';

export function ProcedureEditor() {
  const { user } = useSession();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const procedures = useStoredProcedures(user?.id ?? null);
  const procedure = procedures.find((item) => item.id === id);
  const versions = useVersions(procedure ? id : null);
  const known = versions.data?.find((version) => version.id === procedure?.versionId)?.status;
  const baseId = useId();

  // The copy keeps the state the history says, so the list of procedures shows the real one.
  useEffect(() => {
    if (user && procedure && known && known !== (procedure.status ?? 'DRAFT')) {
      saveProcedure(user.id, { ...procedure, status: known });
    }
  }, [user, procedure, known]);

  if (!user) return <ScreenState kind="loading" label="Cargando el procedimiento…" />;

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

  // Until the history says otherwise, the version of the copy is the draft.
  const shown = known ?? 'DRAFT';
  const leave = () => {
    removeProcedure(user.id, procedure.id);
    router.push('/procedimientos');
  };
  const update = (next: typeof procedure) => saveProcedure(user.id, next);
  // What the API looks at to publish (title, description, steps and areas): when it changes, the
  // actions start again, so an error of an old attempt does not stay on screen.
  const draftKey = JSON.stringify([
    procedure.title,
    procedure.description,
    procedure.steps,
    procedure.areaIds,
  ]);
  // The draft changed (title, description or steps): the history shows its new count and title.
  const changeDraft = (next: typeof procedure) => {
    update(next);
    versions.reload();
  };
  const followDraft = (draft: VersionDetail) => {
    update(withDraftVersion(procedure, draft));
    versions.reload();
  };

  return (
    <>
      <Link href="/procedimientos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
      </Link>

      <PageHeader
        wrap
        title={procedure.title}
        subtitle={versionSummary(procedure.versionNumber, shown)}
      />
      <Notice tone="info" role="note">
        Estos datos son la copia de esta sesión del navegador: la API todavía no tiene un GET (llega
        con HU11). Si el procedimiento se cambia desde otro lugar, la copia puede quedar
        desactualizada.
      </Notice>

      {shown === 'DRAFT' ? (
        <DraftSections procedure={procedure} onChange={changeDraft} onGone={leave} />
      ) : (
        <VersionReadOnly procedureId={id} versionId={procedure.versionId} />
      )}

      <section aria-labelledby={`${baseId}-areas`} className={SECTION}>
        <h2 id={`${baseId}-areas`} className={SECTION_TITLE}>
          Áreas
        </h2>
        <ProcedureAreasForm procedure={procedure} onChange={update} />
      </section>

      <VersionsSection versions={versions}>
        {(items) => (
          <>
            <VersionActions
              key={draftKey}
              procedureId={id}
              versions={items}
              currentVersionId={procedure.versionId}
              onChanged={versions.reload}
              onDraftStarted={followDraft}
            />
            <CompareVersions procedureId={id} versions={items} />
          </>
        )}
      </VersionsSection>
    </>
  );
}
