'use client';

// Resultados de una búsqueda (spec 004, F4, F5, F6; plan 004, 5.1 y 5.3). La API ya filtra por rol y
// áreas y ordena por relevancia (R3, R9): acá no se filtra ni se reordena.
import Link from 'next/link';
import { ScreenState } from '@/components/ui/ScreenState';
import { PAGE_SIZE, describeApiError, searchDocuments, useApiResource } from '@/lib/api';
import { areasDirectory, usersDirectory } from '@/lib/directory';
import { toAreaNameMap } from '@/lib/directory/areas-directory';
import { pageCount } from '@/lib/documents/pagination';
import { DocumentListSkeleton } from './DocumentListSkeleton';
import { Pagination } from './Pagination';
import { SearchResultCard } from './SearchResultCard';

interface SearchResultsProps {
  // El texto ya validado y recortado (parseSearchParam).
  query: string;
  page: number;
  userId: string;
  isAdmin: boolean;
}

const LINK = 'text-blue-700 underline dark:text-blue-400';

const SEARCHING = (
  <ScreenState kind="loading" label="Buscando…">
    <DocumentListSkeleton />
  </ScreenState>
);

const firstPageHref = (query: string) => `/documentos?q=${encodeURIComponent(query)}`;

export function SearchResults({ query, page, userId, isAdmin }: SearchResultsProps) {
  // La clave incluye al usuario: al cambiar de usuario de prueba se vuelve a pedir.
  const results = useApiResource(
    `search?q=${encodeURIComponent(query)}&page=${page}&user=${userId}`,
    (signal) => searchDocuments(query, page, signal),
  );

  // Nombres de áreas y responsables, una vez por página, como en el listado (la API manda solo IDs).
  const areas = useApiResource('areas', () => areasDirectory.listAreas());
  const ownerIds =
    results.status === 'success'
      ? [...new Set(results.data.data.map((result) => result.ownerId))]
      : [];
  const owners = useApiResource(
    ownerIds.length > 0 ? `owners:${ownerIds.join(',')}` : null,
    () => usersDirectory.getNames(ownerIds),
  );

  if (results.status === 'loading' || results.status === 'idle') return SEARCHING;

  if (results.status === 'error') {
    const { message, canRetry } = describeApiError(results.error, 'search');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? results.reload : undefined} />
    );
  }

  const { data, total } = results.data;

  // F5 (E11): el texto va como texto de React, nunca como HTML.
  if (total === 0) {
    return (
      <ScreenState
        kind="empty"
        message={`No encontramos documentos para «${query}»`}
        action={
          <Link href="/documentos" className={LINK}>
            Borrar búsqueda
          </Link>
        }
      />
    );
  }

  // Una página que no existe, por ejemplo ?pagina=9 con 3 páginas.
  if (data.length === 0) {
    return (
      <ScreenState
        kind="empty"
        message="Esta página no existe"
        action={
          <Link href={firstPageHref(query)} className={LINK}>
            Ir a la primera página
          </Link>
        }
      />
    );
  }

  // Se espera a los nombres para no mostrar "—" un instante; si fallan, las tarjetas igual se muestran.
  if (areas.status === 'loading' || owners.status === 'loading') return SEARCHING;
  const areaNames = toAreaNameMap(areas.status === 'success' ? areas.data : []);
  const ownerNames = owners.status === 'success' ? owners.data : {};

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
        {total === 1 ? '1 resultado' : `${total} resultados`} para «{query}»
      </p>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((result) => (
          <li key={result.id} className="min-w-0">
            <SearchResultCard
              result={result}
              areaNames={areaNames}
              ownerName={ownerNames[result.ownerId]}
              isAdmin={isAdmin}
            />
          </li>
        ))}
      </ul>

      {pageCount(total, PAGE_SIZE) > 1 && (
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} query={query} />
      )}
    </div>
  );
}
