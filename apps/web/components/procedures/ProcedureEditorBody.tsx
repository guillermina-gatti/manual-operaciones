'use client';

// What the ADMIN sees of a procedure that is there (HU09, HU10, HU32): its draft, its steps, its areas
// and its versions. If the version is no longer a draft, it is shown read-only. It has no box of its
// own: the main of the page lays its parts out.
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import type { VersionDetail } from '@/lib/procedures';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { withDraftVersion } from '@/lib/procedures/snapshot';
import { versionSummary } from '@/lib/procedures/versions';
import { CompareVersions } from './CompareVersions';
import { DraftSections } from './DraftSections';
import { EditorHeader } from './EditorHeader';
import { SECTION, SECTION_TITLE } from './design';
import { ProcedureAreasForm } from './ProcedureAreasForm';
import { useVersions } from './useVersions';
import { VersionActions } from './VersionActions';
import { VersionReadOnly } from './VersionReadOnly';
import { VersionsSection } from './VersionsSection';

interface ProcedureEditorBodyProps {
  procedure: EditableProcedure;
  onChange: (next: EditableProcedure) => void;
  // Inside the list screen (spec 015, D21): no back link and no h1.
  embedded?: boolean;
  // The draft is gone; the default goes back to the list.
  onGone?: () => void;
  // Something changed on the API (draft saved, published, new version): the screen refreshes its list.
  onChanged?: () => void;
}

export function ProcedureEditorBody({
  procedure,
  onChange,
  embedded = false,
  onGone,
  onChanged,
}: ProcedureEditorBodyProps) {
  const router = useRouter();
  const versions = useVersions(procedure.id);
  const baseId = useId();
  // The history knows the state of every version; until it answers, the one the API gave.
  const known = versions.data?.find((version) => version.id === procedure.versionId)?.status;
  const shown = known ?? procedure.status ?? 'DRAFT';
  // What the API looks at to publish (title, description, steps and areas): when it changes, the
  // actions start again, so an error of an old attempt does not stay on screen.
  const draftKey = JSON.stringify([procedure.title, procedure.description, procedure.steps, procedure.areaIds]);
  // The draft changed (title, description or steps): the history shows its new count and title.
  const changeDraft = (next: EditableProcedure) => {
    onChange(next);
    versions.reload();
    onChanged?.();
  };
  const followDraft = (draft: VersionDetail) => {
    onChange(withDraftVersion(procedure, draft));
    versions.reload();
    onChanged?.();
  };
  const published = () => {
    versions.reload();
    onChanged?.();
  };

  return (
    <>
      <EditorHeader
        embedded={embedded}
        title={procedure.title}
        subtitle={versionSummary(procedure.versionNumber, shown)}
      />

      {shown === 'DRAFT' ? (
        <DraftSections
          procedure={procedure}
          onChange={changeDraft}
          onGone={onGone ?? (() => router.push('/procedimientos'))}
        />
      ) : (
        <>
          <VersionReadOnly procedureId={procedure.id} versionId={procedure.versionId} />
          <section aria-labelledby={`${baseId}-areas`} className={SECTION}>
            <h2 id={`${baseId}-areas`} className={SECTION_TITLE}>
              Áreas
            </h2>
            <ProcedureAreasForm procedure={procedure} onChange={onChange} />
          </section>
        </>
      )}

      <VersionsSection versions={versions}>
        {(items) => (
          <>
            <VersionActions
              key={draftKey}
              procedureId={procedure.id}
              versions={items}
              currentVersionId={procedure.versionId}
              onChanged={published}
              onDraftStarted={followDraft}
            />
            <CompareVersions procedureId={procedure.id} versions={items} />
          </>
        )}
      </VersionsSection>
    </>
  );
}
