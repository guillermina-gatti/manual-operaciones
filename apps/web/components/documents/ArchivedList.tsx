'use client';

// "Archivados" (spec 003, R15): los documentos archivados, con las mismas tarjetas del listado. Solo
// para el ADMIN (la página lo envuelve en RequireRole y la API responde 403 a los demás). La API ya
// filtra y ordena (el archivado más reciente primero): acá no se filtra ni se reordena.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ScreenState } from '@/components/ui/ScreenState';
import {
  ApiError,
  PAGE_SIZE,
  describeApiError,
  listArchivedDocuments,
  useApiResource,
} from '@/lib/api';
import { pageCount, parsePageParam } from '@/lib/documents/pagination';
import { useSession } from '@/lib/session';
import { ARCHIVED_PATH } from './ArchivedLink';
import { DocumentCard } from './DocumentCard';
import { DocumentListSkeleton } from './DocumentListSkeleton';
import { Pagination } from './Pagination';
import { TEXT_LINK } from './design';

const LOADING = (
  <ScreenState kind="loading" label="Cargando los documentos archivados…">
    <DocumentListSkeleton />
  </ScreenState>
);

export function ArchivedList() {
  const { user, status } = useSession();
  const page = parsePageParam(useSearchParams().get('pagina'));

  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  const archived = useApiResource(
    user ? `archived?page=${page}&user=${user.id}` : null,
    (signal) => listArchivedDocuments(page, PAGE_SIZE, signal),
  );

  if (status === 'loading') return LOADING;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'list').message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;

  if (archived.status === 'loading' || archived.status === 'idle') return LOADING;

  if (archived.status === 'error') {
    const { message, canRetry } = describeApiError(archived.error, 'list');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? archived.reload : undefined} />
    );
  }

  const { data, total } = archived.data;

  if (total === 0) {
    return <ScreenState kind="empty" message="No hay documentos archivados" />;
  }

  // Una página que no existe, por ejemplo ?pagina=9 con 3 archivados.
  if (data.length === 0) {
    return (
      <ScreenState
        kind="empty"
        message="Esta página no existe"
        action={
          <Link href={ARCHIVED_PATH} className={TEXT_LINK}>
            Ir a la primera página
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((document) => (
          <li key={document.id} className="min-w-0">
            <DocumentCard document={document} isAdmin />
          </li>
        ))}
      </ul>

      {pageCount(total, PAGE_SIZE) > 1 && (
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} basePath={ARCHIVED_PATH} />
      )}
    </div>
  );
}
