// /documentos: listado de los documentos visibles para el usuario (F12).
// Componente de servidor sin datos: el listado se pide desde el navegador (D1). Con cacheComponents,
// lo que usa useSearchParams tiene que estar dentro de un <Suspense>; su fallback es el estado "cargando".
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentListSkeleton } from '@/components/documents/DocumentListSkeleton';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Documentos · Manual de operaciones',
};

export default function DocumentosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Documentos</h1>
      <Suspense
        fallback={
          <ScreenState kind="loading" label="Cargando documentos…">
            <DocumentListSkeleton />
          </ScreenState>
        }
      >
        <DocumentList />
      </Suspense>
    </main>
  );
}
