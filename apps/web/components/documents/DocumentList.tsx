'use client';

// Listado de documentos visibles para el usuario (F1, F7; plan 002, sección 1).
// La API ya filtra por rol y áreas y ordena del más nuevo al más viejo: acá no se filtra ni se reordena.
// Spec 004 (F1, F2, F3; plan 004, 5.2 y D11): arriba, la caja de búsqueda; con un ?q= válido, en vez
// del listado se muestran los resultados. La búsqueda vive solo en la dirección.
// Dos vistas (Lista, por defecto, y Tarjetas), elegidas con ?vista=: la conservan la búsqueda, la
// paginación y los enlaces de los estados vacíos.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ScreenState } from '@/components/ui/ScreenState';
import {
  ApiError,
  PAGE_SIZE,
  describeApiError,
  listDocuments,
  useApiResource,
} from '@/lib/api';
import { pageCount, parsePageParam } from '@/lib/documents/pagination';
import { parseSearchParam } from '@/lib/documents/search-rules';
import { parseViewParam, viewQuery, withView } from '@/lib/documents/view';
import type { DocumentsView } from '@/lib/documents/view';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import { DocumentCollection } from './DocumentCollection';
import { DocumentListSkeleton, skeletonFor } from './DocumentListSkeleton';
import { Pagination } from './Pagination';
import { ConflictAlertsLink } from './ConflictAlertsLink';
import { PendingReviewLink } from './PendingReviewLink';
import { SearchBox } from './SearchBox';
import { SearchResults } from './SearchResults';
import { ViewSwitch } from './ViewSwitch';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, TEXT_LINK } from './design';
import { DocumentsHeader, LIST_BUTTON_PRIMARY } from './list-design';

// "Cargando" con el esqueleto de la vista activa.
const loading = (view: DocumentsView) => (
  <ScreenState kind="loading" label="Cargando documentos…">
    <DocumentListSkeleton variant={skeletonFor(view)} />
  </ScreenState>
);

export function DocumentList() {
  const { user, status } = useSession();
  const searchParams = useSearchParams();
  const query = searchParams.get('q');
  const search = parseSearchParam(query);
  const page = parsePageParam(searchParams.get('pagina'));
  const view = parseViewParam(searchParams.get('vista'));
  const isAdmin = status === 'ready' && user?.role === 'ADMIN';

  return (
    <>
      {/* F1: "Cargar documento" solo para el ADMIN, con y sin búsqueda. Va en el encabezado: es la
          acción principal de la pantalla. */}
      <DocumentsHeader
        action={
          isAdmin && (
            <Link href="/documentos/nuevo" className={LIST_BUTTON_PRIMARY}>
              Cargar documento
            </Link>
          )
        }
      />
      <div className="flex flex-col gap-6">
        {/* key: al ir atrás o adelante, la caja vuelve a arrancar con el ?q= de la dirección. */}
        <SearchBox key={query ?? ''} query={query} view={view} />
        {/* A la izquierda, el selector de vista; a la derecha, los accesos. Spec 005 (F2): "Por
            revisar", con y sin búsqueda; para quien no es ADMIN ni responsable de nada no muestra nada. */}
        {status === 'ready' && user && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ViewSwitch view={view} />
            <div className="flex flex-wrap justify-end gap-3">
              {/* Spec 009 (F1, D11): el acceso al asistente, hasta que el menú (pareja A) tenga el enlace. */}
              <Link href="/asistente" className={BUTTON_SECONDARY}>
                Preguntale al asistente <span aria-hidden="true">✦</span>
              </Link>
              <PendingReviewLink userId={user.id} isAdmin={user.role === 'ADMIN'} />
              {/* Spec 011 (F5, D11): las alertas de contradicción, solo para el ADMIN. */}
              {user.role === 'ADMIN' && <ConflictAlertsLink userId={user.id} />}
            </div>
          </div>
        )}
        {search.kind === 'valid' && status === 'ready' && user ? (
          <SearchResults
            query={search.text}
            page={page}
            userId={user.id}
            isAdmin={user.role === 'ADMIN'}
            view={view}
          />
        ) : (
          // Sin búsqueda, o con un ?q= inválido (F2: la caja avisa y no se busca), el listado de siempre.
          <DocumentListing view={view} />
        )}
      </div>
    </>
  );
}

const describeTotal = (total: number) => (total === 1 ? '1 documento' : `${total} documentos`);

function DocumentListing({ view }: { view: DocumentsView }) {
  const { user, status } = useSession();
  const page = parsePageParam(useSearchParams().get('pagina'));
  const isAdmin = user?.role === 'ADMIN';

  // La clave incluye al usuario: al cambiar de usuario de prueba se vuelve a pedir.
  const documents = useApiResource(user ? `documents?page=${page}&user=${user.id}` : null, (signal) =>
    listDocuments(page, signal),
  );

if (status === 'loading') return loading(view);

if (status === 'disabled') {
  return (
    <ScreenState
      kind="error"
      message={describeApiError(new ApiError(401), 'list').message}
    />
  );
}

if (!user) {
  return REAL_AUTH_ENABLED ? (
    <ScreenState
      kind="empty"
      message="Necesitás iniciar sesión para ver los documentos."
      action={
        <Link
          href="/login"
          className={TEXT_LINK}
        >
          Ir a iniciar sesión
        </Link>
      }
    />
  ) : (
    <ScreenState
      kind="empty"
      message="Elegí un usuario de prueba"
    />
  );
}

  if (documents.status === 'loading' || documents.status === 'idle') return loading(view);

  if (documents.status === 'error') {
    const { message, canRetry } = describeApiError(documents.error, 'list');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? documents.reload : undefined} />
    );
  }

  const { data, total } = documents.data;

  // Lista vacía (caso borde): el ADMIN ve todas las áreas y tiene el botón para cargar el primero.
  if (total === 0) {
    return isAdmin ? (
      <ScreenState
        kind="empty"
        message="Todavía no hay documentos"
        action={
          <Link href="/documentos/nuevo" className={BUTTON_PRIMARY}>
            Cargar el primer documento
          </Link>
        }
      />
    ) : (
      <ScreenState kind="empty" message="Todavía no hay documentos en tus áreas" />
    );
  }

  // Una página que no existe, por ejemplo ?pagina=9 con 3 páginas.
  if (data.length === 0) {
    return (
      <ScreenState
        kind="empty"
        message="Esta página no existe"
        action={
          <Link href={withView('/documentos', view)} className={TEXT_LINK}>
            Ir a la primera página
          </Link>
        }
      />
    );
  }

  // Spec 008 (F1): los nombres del responsable y de las áreas vienen en cada documento.
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-texto-suave">{describeTotal(total)}</p>

      <DocumentCollection documents={data} view={view} isAdmin={isAdmin} />

      {pageCount(total, PAGE_SIZE) > 1 && (
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={PAGE_SIZE}
          extraQuery={viewQuery(view)}
        />
      )}
    </div>
  );
}
