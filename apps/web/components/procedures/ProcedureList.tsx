'use client';

// The home of the procedures screens (spec 006, W1 to W3): the list the API gives for this user and,
// only for an ADMIN, the form to create a procedure. When it creates one, the same screen shows its
// draft in place of the form (spec 015, D21). It has no box of its own: the main of the page lays its
// parts out. Spec 017: the title of the list is only for screen readers (D1), the form has the
// hornero beside it (D5) and the notice of the new draft has a green button (D6).
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { LIST_BUTTON_SECONDARY, LIST_PANEL } from '@/components/documents/list-design';
import { parsePageParam } from '@/lib/documents/pagination';
import { useSession } from '@/lib/session';
import { CreateProcedureForm } from './CreateProcedureForm';
import { SECTION_TITLE } from './design';
import { ProcedureCollection } from './ProcedureCollection';
import { ProcedureEditorById } from './ProcedureEditor';
import { useProcedureList } from './useProcedureList';

const countLabel = (total: number) => `${total} ${total === 1 ? 'procedimiento' : 'procedimientos'}`;

// The hornero is decoration: its words are the steps of the form.
function HorneroAside() {
  return (
    <aside className="hidden flex-col items-center gap-3 rounded-2xl bg-salvia p-5 text-center md:flex">
      <Image src="/hornero.png" alt="" width={352} height={465} className="h-auto w-24 select-none" />
      <p className="font-bold text-bosque">Como el hornero, paso a paso</p>
      <span aria-hidden="true" className="flex gap-1.5">
        {[0, 1, 2, 3].map((dot) => (
          <span key={dot} className="size-2.5 rounded-full bg-naranja" />
        ))}
      </span>
      <p className="text-sm text-texto-suave">Título · Pasos · Áreas · Publicar</p>
    </aside>
  );
}

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
        <>
          <div className="relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border border-bosque/15 bg-salvia p-5 pr-28">
            <Image
              src="/hornero.png"
              alt=""
              width={352}
              height={465}
              className="pointer-events-none absolute top-3 right-4 h-auto w-16 select-none"
            />
            <p className="text-lg font-bold text-bosque">¡Borrador creado!</p>
            <p className="text-texto-suave">
              Agregale pasos y áreas abajo. Nadie lo ve hasta que lo publiques.
            </p>
            <button
              type="button"
              className={`${LIST_BUTTON_SECONDARY} mt-2 border-exito! bg-exito! text-blanco! hover:bg-[#126E3C]!`}
              onClick={() => {
                setDraftId(null);
                list.reload();
              }}
            >
              Crear otro procedimiento
            </button>
          </div>
          <ProcedureEditorById
            id={draftId}
            embedded
            onChanged={list.reload}
            onGone={() => {
              setDraftId(null);
              list.reload();
            }}
          />
        </>
      )}
      {isAdmin && !draftId && (
        <section
          aria-labelledby={`${baseId}-create`}
          className={`${LIST_PANEL} grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center`}
        >
          <div className="flex min-w-0 flex-col gap-5">
            <h2 id={`${baseId}-create`} className={SECTION_TITLE}>
              Crear un procedimiento
            </h2>
            <CreateProcedureForm
              onCreated={(id) => {
                setDraftId(id);
                list.reload();
              }}
            />
          </div>
          <HorneroAside />
        </section>
      )}

      <section aria-labelledby={`${baseId}-list`} className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={`${baseId}-list`} className="sr-only">
            Procedimientos
          </h2>
          {list.status === 'success' && (
            <p className="ml-auto font-semibold text-texto-suave">{countLabel(list.data.total)}</p>
          )}
        </div>
        <ProcedureCollection list={list} page={page} isAdmin={isAdmin} />
      </section>
    </>
  );
}
