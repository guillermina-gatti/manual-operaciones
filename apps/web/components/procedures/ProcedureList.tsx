'use client';

// The home of the procedures screens (spec 006, W1 to W3): the list the API gives for this user and,
// only for an ADMIN, the form to create a procedure. When it creates one, the same screen shows its
// draft in place of the form (spec 015, D21). It has no box of its own: the main of the page lays its
// parts out.
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { LIST_PANEL } from '@/components/documents/list-design';
import { parsePageParam } from '@/lib/documents/pagination';
import { useSession } from '@/lib/session';
import { CreateProcedureForm } from './CreateProcedureForm';
import { ProcedureCollection } from './ProcedureCollection';
import { ProcedureEditorById } from './ProcedureEditor';
import { useProcedureList } from './useProcedureList';

const SECTION_TITLE = 'text-xl font-bold';

export function ProcedureList() {
  const { user } = useSession();
  const page = parsePageParam(useSearchParams().get('pagina'));
  const list = useProcedureList(page);
  const baseId = useId();
  const isAdmin = user?.role === 'ADMIN';
  // The draft that was just created, shown in place of the form.
  const [draftId, setDraftId] = useState<string | null>(null);

  return (
    <>
      {isAdmin && draftId && (
        <ProcedureEditorById
          id={draftId}
          embedded
          onGone={() => {
            setDraftId(null);
            list.reload();
          }}
        />
      )}
      {isAdmin && !draftId && (
        <section aria-labelledby={`${baseId}-create`} className={`${LIST_PANEL} flex flex-col gap-5`}>
          <h2 id={`${baseId}-create`} className={SECTION_TITLE}>
            Crear un procedimiento
          </h2>
          <CreateProcedureForm
            onCreated={(id) => {
              setDraftId(id);
              list.reload();
            }}
          />
        </section>
      )}

      <section aria-labelledby={`${baseId}-list`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-list`} className={SECTION_TITLE}>
          Procedimientos
        </h2>
        <ProcedureCollection list={list} page={page} isAdmin={isAdmin} />
      </section>
    </>
  );
}
