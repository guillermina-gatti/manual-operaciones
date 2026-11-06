// /documentos: listado de los documentos visibles para el usuario (F12).
// Componente de servidor sin datos: el listado se pide desde el navegador (D1). Con cacheComponents,
// lo que usa useSearchParams tiene que estar dentro de un <Suspense>; su fallback es el estado "cargando".
// El encabezado lo dibuja DocumentList, porque su acción ("Cargar documento") depende del rol.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentListSkeleton } from '@/components/documents/DocumentListSkeleton';
import { DocumentsHeader } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Documentos · Manual de operaciones',
};

export default function DocumentosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <Suspense
        fallback={
          <>
            <DocumentsHeader />
            <ScreenState kind="loading" label="Cargando documentos…">
              <DocumentListSkeleton />
            </ScreenState>
          </>
        }
      >
        <DocumentList />
      </Suspense>
    </main>
  );
}
