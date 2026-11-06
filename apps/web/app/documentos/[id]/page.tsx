// /documentos/[id]: detalle de un documento (F12).
// Componente de servidor sin datos: el detalle se pide desde el navegador (D1). Sin generateStaticParams,
// el id no se conoce al compilar y useParams tiene que estar dentro de un <Suspense> (cacheComponents).
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DocumentDetail, DocumentDetailSkeleton } from '@/components/documents/DocumentDetail';
import { BACK_LINK } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Documento · Manual de operaciones',
};

export default function DocumentoPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Link href="/documentos" className={`${BACK_LINK} group`}>
        {/* La flecha se corre a la izquierda al pasar; quieta si se pide menos movimiento. */}
        <span
          aria-hidden="true"
          className="inline-block transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        >
          ←&nbsp;
        </span>
        Volver a Documentos
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
