// /documentos/por-revisar: los documentos por vencer o vencidos que el usuario puede revisar (spec 005,
// F3). Componente de servidor sin datos, como /documentos: la lista se pide desde el navegador, y lo
// que usa useSearchParams va dentro de un <Suspense> (cacheComponents). Es un segmento fijo: Next lo
// resuelve antes que /documentos/[id].
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DocumentListSkeleton } from '@/components/documents/DocumentListSkeleton';
import { PendingReviewList } from '@/components/documents/PendingReviewList';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Por revisar · Manual de operaciones',
};

export default function PorRevisarPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Link
        href="/documentos"
        className="inline-flex min-h-11 items-center self-start text-blue-700 hover:underline dark:text-blue-400"
      >
        <span aria-hidden="true">←&nbsp;</span>Volver a Documentos
      </Link>
      <h1 className="text-2xl font-semibold">Por revisar</h1>
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando los documentos por revisar…">
            <DocumentListSkeleton />
          </ScreenState>
        }
      >
        <PendingReviewList />
      </Suspense>
    </main>
  );
}
