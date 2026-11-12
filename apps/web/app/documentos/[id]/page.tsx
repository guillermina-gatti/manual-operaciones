// /documentos/[id]: detalle de un documento (F12).
// Componente de servidor sin datos: el detalle se pide desde el navegador (D1). Sin generateStaticParams,
// el id no se conoce al compilar y useParams tiene que estar dentro de un <Suspense> (cacheComponents).
// La ruta ("Documentos › título", plan 002, D9) la dibuja DocumentDetail, que conoce el título y lee la
// vista de la dirección; mientras tanto, la ruta de siempre a /documentos.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DocumentDetail, DocumentDetailSkeleton } from '@/components/documents/DocumentDetail';
import { Breadcrumb } from '@/components/documents/DocumentsBreadcrumb';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Documento · Manual de operaciones',
};

export default function DocumentoPage() {
  return (
    // pb-28: espacio al pie para que lo último (el historial) pueda quedar por encima de lo que flota
    // abajo (en desarrollo, el selector de sesión y la insignia de Next).
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-8 pb-28">
      <Suspense
        fallback={
          <>
            <Breadcrumb href="/documentos" />
            <ScreenState kind="loading" label="Cargando el documento…">
              <DocumentDetailSkeleton />
            </ScreenState>
          </>
        }
      >
        <DocumentDetail />
      </Suspense>
    </main>
  );
}
