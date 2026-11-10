'use client';

// Resultados de una búsqueda (spec 004, F4, F5, F6; plan 004, 5.1 y 5.3). La API ya filtra por rol y
// áreas y ordena por relevancia (R3, R9): acá no se filtra ni se reordena.
// Se dibujan en la vista elegida (Lista o Tarjetas), con el fragmento de cada resultado.
import Link from 'next/link';
import { ScreenState } from '@/components/ui/ScreenState';
import { PAGE_SIZE, describeApiError, searchDocuments, useApiResource } from '@/lib/api';
import { pageCount } from '@/lib/documents/pagination';
import { viewQuery, withView } from '@/lib/documents/view';
import type { DocumentsView } from '@/lib/documents/view';
import { DocumentCollection } from './DocumentCollection';
import { DocumentListSkeleton, skeletonFor } from './DocumentListSkeleton';
import { Pagination } from './Pagination';
import { TEXT_LINK } from './design';

interface SearchResultsProps {
  // El texto ya validado y recortado (parseSearchParam).
  query: string;
  page: number;
  userId: string;
  isAdmin: boolean;
  // La vista del listado (por defecto, Lista).
  view?: DocumentsView;
}

const LINK = TEXT_LINK;

const firstPageHref = (query: string) => `/documentos?q=${encodeURIComponent(query)}`;

export function SearchResults({ query, page, userId, isAdmin, view = 'lista' }: SearchResultsProps) {
  // La clave incluye al usuario: al cambiar de usuario de prueba se vuelve a pedir.
  const results = useApiResource(
    `search?q=${encodeURIComponent(query)}&page=${page}&user=${userId}`,
    (signal) => searchDocuments(query, page, signal),
  );

  if (results.status === 'loading' || results.status === 'idle') {
    return (
      <ScreenState kind="loading" label="Buscando…">
        <DocumentListSkeleton variant={skeletonFor(view)} />
      </ScreenState>
    );
  }

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
          <Link href={withView('/documentos', view)} className={LINK}>
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
          <Link href={withView(firstPageHref(query), view)} className={LINK}>
            Ir a la primera página
          </Link>
        }
      />
    );
  }

  // Spec 008 (F1, P2): los nombres vienen en cada resultado, como en el listado.
  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="text-sm text-texto-suave">
        {total === 1 ? '1 resultado' : `${total} resultados`} para «{query}»
      </p>

      <DocumentCollection documents={data} view={view} isAdmin={isAdmin} />

      {pageCount(total, PAGE_SIZE) > 1 && (
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={PAGE_SIZE}
          query={query}
          extraQuery={viewQuery(view)}
        />
      )}
    </div>
  );
}
