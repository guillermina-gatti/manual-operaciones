// /documentos/[id]: detalle de un documento (F12).
// Componente de servidor sin datos: el detalle se pide desde el navegador (D1). Sin generateStaticParams,
// el id no se conoce al compilar y useParams tiene que estar dentro de un <Suspense> (cacheComponents).
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DocumentDetail, DocumentDetailSkeleton } from '@/components/documents/DocumentDetail';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Documento · Manual de operaciones',
};

export default function DocumentoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link
        href="/documentos"
        className="inline-flex min-h-11 items-center self-start text-blue-700 hover:underline dark:text-blue-400"
      >
        <span aria-hidden="true">←&nbsp;</span>Volver a Documentos
      </Link>
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando el documento…">
            <DocumentDetailSkeleton />
          </ScreenState>
        }
      >
        <DocumentDetail />
      </Suspense>
    </main>
  );
}
