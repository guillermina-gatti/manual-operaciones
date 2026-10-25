'use client';

// Listado de documentos visibles para el usuario (F1, F7; plan 002, sección 1).
// La API ya filtra por rol y áreas y ordena del más nuevo al más viejo: acá no se filtra ni se reordena.
// Spec 004 (F1, F2, F3; plan 004, 5.2 y D11): arriba, la caja de búsqueda; con un ?q= válido, en vez
// del listado se muestran los resultados. La búsqueda vive solo en la dirección.
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
import { areasDirectory, usersDirectory } from '@/lib/directory';
import { pageCount, parsePageParam } from '@/lib/documents/pagination';
import { parseSearchParam } from '@/lib/documents/search-rules';
import { useSession } from '@/lib/session';
import { DocumentCard } from './DocumentCard';
import { DocumentListSkeleton } from './DocumentListSkeleton';
import { Pagination } from './Pagination';
import { SearchBox } from './SearchBox';
import { SearchResults } from './SearchResults';

// Enlace con forma de botón principal (mismo estilo que Button, 44 px de alto: F10).
const LINK_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-blue-700 px-4 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:text-zinc-950 dark:hover:bg-blue-400';

const LOADING = (
  <ScreenState kind="loading" label="Cargando documentos…">
    <DocumentListSkeleton />
  </ScreenState>
);

export function DocumentList() {
  const { user, status } = useSession();
  const searchParams = useSearchParams();
  const query = searchParams.get('q');
  const search = parseSearchParam(query);
  const page = parsePageParam(searchParams.get('pagina'));

  return (
    <div className="flex flex-col gap-6">
      {/* key: al ir atrás o adelante, la caja vuelve a arrancar con el ?q= de la dirección. */}
      <SearchBox key={query ?? ''} query={query} />
      {search.kind === 'valid' && status === 'ready' && user ? (
        <>
          {user.role === 'ADMIN' && (
            <div className="flex justify-end">
              <Link href="/documentos/nuevo" className={LINK_BUTTON}>
                Cargar documento
              </Link>
            </div>
          )}
          <SearchResults
            query={search.text}
            page={page}
            userId={user.id}
            isAdmin={user.role === 'ADMIN'}
          />
        </>
      ) : (
        // Sin búsqueda, o con un ?q= inválido (F2: la caja avisa y no se busca), el listado de siempre.
        <DocumentListing />
      )}
    </div>
  );
}

function DocumentListing() {
  const { user, status } = useSession();
  const page = parsePageParam(useSearchParams().get('pagina'));
  const isAdmin = user?.role === 'ADMIN';

  // La clave incluye al usuario: al cambiar de usuario de prueba se vuelve a pedir.
  const documents = useApiResource(user ? `documents?page=${page}&user=${user.id}` : null, (signal) =>
    listDocuments(page, signal),
  );

  // Nombres de áreas y responsables: una vez por página, no por tarjeta (la API manda solo IDs, Q1).
  const areas = useApiResource(user ? 'areas' : null, () => areasDirectory.listAreas());
  const ownerIds =
    documents.status === 'success'
      ? [...new Set(documents.data.data.map((document) => document.ownerId))]
      : [];
  const owners = useApiResource(ownerIds.length > 0 ? `owners:${ownerIds.join(',')}` : null, () =>
    usersDirectory.getNames(ownerIds),
  );

  if (status === 'loading') return LOADING;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'list').message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;

  if (documents.status === 'loading' || documents.status === 'idle') return LOADING;

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
          <Link href="/documentos/nuevo" className={LINK_BUTTON}>
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
          <Link href="/documentos" className="text-blue-700 underline dark:text-blue-400">
            Ir a la primera página
          </Link>
        }
      />
    );
  }

  // Se espera a los nombres para no mostrar "—" un instante; si fallan, las tarjetas igual se muestran.
  if (areas.status === 'loading' || owners.status === 'loading') return LOADING;
  const areaNames = Object.fromEntries(
    (areas.status === 'success' ? areas.data : []).map((area) => [area.id, area.name]),
  );
  const ownerNames = owners.status === 'success' ? owners.data : {};

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
        <div className="flex justify-end">
          <Link href="/documentos/nuevo" className={LINK_BUTTON}>
            Cargar documento
          </Link>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((document) => (
          <li key={document.id} className="min-w-0">
            <DocumentCard
              document={document}
              areaNames={areaNames}
              ownerName={ownerNames[document.ownerId]}
              isAdmin={isAdmin}
            />
          </li>
        ))}
      </ul>

      {pageCount(total, PAGE_SIZE) > 1 && (
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} />
      )}
    </div>
  );
}
