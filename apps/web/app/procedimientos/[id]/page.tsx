// /procedimientos/[id]: one procedure (spec 006, HU09 to HU11). An ADMIN gets the editor; SUPERVISOR and
// EMPLOYEE, the read-only sheet. The API decides what each one can read (a procedure of another area
// is a 404). A server component without data: the id is read in the browser. Without
// generateStaticParams the id is not known at build time, so useParams has to be inside a <Suspense>
// (cacheComponents).
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProcedureDetailScreen } from '@/components/procedures/ProcedureDetailScreen';
import { Skeleton } from '@/components/procedures/Skeleton';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';
import { ROLES } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Procedimiento · Manual de operaciones',
};

export default function ProcedimientoPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 pb-28 text-base">
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando el procedimiento…">
            <Skeleton heights={['h-12 w-2/3', 'h-48', 'h-64', 'h-32']} />
          </ScreenState>
        }
      >
        <RequireRole roles={ROLES} deniedMessage="No tenés permiso para ver los procedimientos.">
          <ProcedureDetailScreen />
        </RequireRole>
      </Suspense>
    </main>
  );
}
