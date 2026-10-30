'use client';

// "Por revisar" (spec 005, F3, R5; plan 005, 7.4): los documentos por vencer o vencidos que el usuario
// puede revisar, con las mismas tarjetas del listado. La API ya filtra y ordena (los vencidos
// primero): acá no se filtra ni se reordena. Quien no es responsable de nada recibe la lista vacía (D9).
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ScreenState } from '@/components/ui/ScreenState';
import {
  ApiError,
  PAGE_SIZE,
  describeApiError,
  listPendingReview,
  useApiResource,
} from '@/lib/api';
import { areasDirectory, usersDirectory } from '@/lib/directory';
import { pageCount, parsePageParam } from '@/lib/documents/pagination';
import { useSession } from '@/lib/session';
import { DocumentCard } from './DocumentCard';
import { DocumentListSkeleton } from './DocumentListSkeleton';
import { Pagination } from './Pagination';

const BASE_PATH = '/documentos/por-revisar';

const LOADING = (
  <ScreenState kind="loading" label="Cargando los documentos por revisar…">
    <DocumentListSkeleton />
  </ScreenState>
);

export function PendingReviewList() {
  const { user, status } = useSession();
  const page = parsePageParam(useSearchParams().get('pagina'));
  const isAdmin = user?.role === 'ADMIN';

  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  const pending = useApiResource(
    user ? `pending-review?page=${page}&user=${user.id}` : null,
    (signal) => listPendingReview(page, PAGE_SIZE, signal),
  );

  // Nombres de áreas y responsables: una vez por página, como el listado.
  const areas = useApiResource(user ? 'areas' : null, () => areasDirectory.listAreas());
  const ownerIds =
    pending.status === 'success'
      ? [...new Set(pending.data.data.map((document) => document.ownerId))]
      : [];
  const owners = useApiResource(ownerIds.length > 0 ? `owners:${ownerIds.join(',')}` : null, () =>
    usersDirectory.getNames(ownerIds),
  );

  if (status === 'loading') return LOADING;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'list').message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;

  if (pending.status === 'loading' || pending.status === 'idle') return LOADING;

  if (pending.status === 'error') {
    const { message, canRetry } = describeApiError(pending.error, 'list');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? pending.reload : undefined} />
    );
  }

  const { data, total } = pending.data;

  if (total === 0) {
    return <ScreenState kind="empty" message="No tenés documentos para revisar" />;
  }

  // Una página que no existe, por ejemplo ?pagina=9 con 3 pendientes.
  if (data.length === 0) {
    return (
      <ScreenState
        kind="empty"
        message="Esta página no existe"
        action={
          <Link href={BASE_PATH} className="text-blue-700 underline dark:text-blue-400">
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
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} basePath={BASE_PATH} />
      )}
    </div>
  );
}
