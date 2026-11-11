// /procedimientos: the procedures the user can see (spec 006, HU11). Every role comes in: the API
// answers each one with what its areas allow, and only the ADMIN gets the form to create. A server
// component without data: the list is asked from the browser. useSearchParams (the page number) has
// to be inside a <Suspense> (cacheComponents), and its fallback is the loading state.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { ProceduresHeader } from '@/components/procedures/ProceduresHeader';
import { Skeleton } from '@/components/procedures/Skeleton';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';
import { ROLES } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Procedimientos · Manual de operaciones',
};

export default function ProcedimientosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 pb-28 text-base">
      <ProceduresHeader />
      <RequireRole roles={ROLES} deniedMessage="No tenés permiso para ver los procedimientos.">
        <Suspense
          fallback={
            <ScreenState kind="loading" label="Cargando procedimientos…">
              <Skeleton heights={['h-48', 'h-48', 'h-48', 'h-48']} />
            </ScreenState>
          }
        >
          <ProcedureList />
        </Suspense>
      </RequireRole>
    </main>
  );
}
