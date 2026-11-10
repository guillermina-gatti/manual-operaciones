// /documentos: listado de los documentos visibles para el usuario (F12).
// Componente de servidor sin datos: el listado se pide desde el navegador (D1). Con cacheComponents,
// lo que usa useSearchParams tiene que estar dentro de un <Suspense>; su fallback es el estado "cargando".
// El encabezado lo dibuja DocumentList, porque su acción ("Cargar documento") depende del rol.
//
// El esqueleto sigue la vista (?vista=): el armazón estático se arma sin la dirección, así que solo
// trae el encabezado. Adentro, ListingWithSkeleton lee searchParams (dentro de su <Suspense>, como pide
// cacheComponents) y elige el esqueleto de la vista activa: nunca se ve el de la otra.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentListSkeleton, skeletonFor } from '@/components/documents/DocumentListSkeleton';
import { DocumentsHeader } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import { VIEW_PARAM, parseViewParam } from '@/lib/documents/view';

export const metadata: Metadata = {
  title: 'Documentos · Manual de operaciones',
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function DocumentosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <Suspense fallback={<DocumentsHeader />}>
        <ListingWithSkeleton searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ListingWithSkeleton({ searchParams }: { searchParams: SearchParams }) {
  const value = (await searchParams)[VIEW_PARAM];
  const view = parseViewParam(typeof value === 'string' ? value : null);

  return (
    <Suspense
      fallback={
        <>
          <DocumentsHeader />
          <ScreenState kind="loading" label="Cargando documentos…">
            <DocumentListSkeleton variant={skeletonFor(view)} />
          </ScreenState>
        </>
      }
    >
      <DocumentList />
    </Suspense>
  );
}
