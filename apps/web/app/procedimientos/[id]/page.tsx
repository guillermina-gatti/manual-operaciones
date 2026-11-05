// /procedimientos/[id]: the draft, the steps and the areas of a procedure (HU09 and HU10). Only ADMIN;
// the API answers 403 anyway. A server component without data: the id is read in the browser. Without
// generateStaticParams the id is not known at build time, so useParams has to be inside a <Suspense>
// (cacheComponents).
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Procedimiento · Manual de operaciones',
};

export default function ProcedimientoPage() {
  return (
    <div className="flex-1">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<ScreenState kind="loading" label="Cargando el procedimiento…" />}>
          <RequireRole
            role="ADMIN"
            deniedMessage="Solo un administrador puede crear y editar procedimientos."
          >
            <ProcedureEditor />
          </RequireRole>
        </Suspense>
      </main>
    </div>
  );
}
