// /documentos/[id]: detalle de un documento (F12).
// Componente de servidor sin datos: el detalle se pide desde el navegador (D1). Sin generateStaticParams,
// el id no se conoce al compilar y useParams tiene que estar dentro de un <Suspense> (cacheComponents).
// "Volver a Documentos" conserva la vista con la que se entró (?vista=): como lee la dirección, también
// va dentro de un <Suspense>; mientras tanto, el enlace de siempre a /documentos.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BackLink, BackToDocuments } from '@/components/documents/BackToDocuments';
import { DocumentDetail, DocumentDetailSkeleton } from '@/components/documents/DocumentDetail';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Documento · Manual de operaciones',
};

export default function DocumentoPage() {
  return (
    // pb-28: espacio al pie para que lo último (el historial) pueda quedar por encima de lo que flota
    // abajo (en desarrollo, el selector de sesión y la insignia de Next).
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-8 pb-28">
      <Suspense fallback={<BackLink href="/documentos" />}>
        <BackToDocuments />
      </Suspense>
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
