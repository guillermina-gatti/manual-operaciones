// /documentos/archivados: los documentos archivados, solo ADMIN (spec 003, R15). Componente de
// servidor sin datos, como /documentos/por-revisar: la lista se pide desde el navegador, y lo que usa
// useSearchParams va dentro de un <Suspense> (cacheComponents). Es un segmento fijo: Next lo resuelve
// antes que /documentos/[id]. Otro rol ve el mensaje de RequireRole; la API igual responde 403.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArchivedList } from '@/components/documents/ArchivedList';
import { DocumentListSkeleton } from '@/components/documents/DocumentListSkeleton';
import { BACK_LINK, PageHeader } from '@/components/documents/design';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Archivados · Manual de operaciones',
};

export default function ArchivadosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <Link href="/documentos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a Documentos
      </Link>
      <PageHeader
        title="Archivados"
        subtitle="Los documentos que ya no están vigentes. El asistente y la búsqueda no los usan."
      />
      <RequireRole role="ADMIN" deniedMessage="No tenés permiso para ver los documentos archivados.">
        <Suspense
          fallback={
            <ScreenState kind="loading" label="Cargando los documentos archivados…">
              <DocumentListSkeleton />
            </ScreenState>
          }
        >
          <ArchivedList />
        </Suspense>
      </RequireRole>
    </main>
  );
}
