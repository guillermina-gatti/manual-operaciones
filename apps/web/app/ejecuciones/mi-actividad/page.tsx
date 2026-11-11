// /ejecuciones/mi-actividad: the employee's own activity. Only EMPLOYEE: another role sees
// RequireRole's message and the panel is not even mounted. The API answers 403 anyway, and the
// user always comes from the session. The filters use useSearchParams, so the panel goes inside a
// <Suspense>.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BACK_LINK, PageHeader } from '@/components/documents/design';
import { MyActivityPanel, MyActivitySkeleton } from '@/components/executions/MyActivityPanel';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Mi actividad · Manual de operaciones',
};

export default function MiActividadPage() {
  return (
    // The same frame as /ejecuciones and /metricas.
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <Link href="/ejecuciones" className={BACK_LINK}>
        ← Volver a Ejecutar un procedimiento
      </Link>
      <PageHeader
        title="Mi actividad"
        subtitle="Tus ejecuciones: cuántas terminaste, cuánto tardás y cuáles podés retomar. Solo las ves vos."
      />
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando tu actividad…">
            <MyActivitySkeleton />
          </ScreenState>
        }
      >
        <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ver su actividad.">
          <MyActivityPanel />
        </RequireRole>
      </Suspense>
    </main>
  );
}
