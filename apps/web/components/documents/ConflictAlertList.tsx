'use client';

// "Alertas" (spec 011, F6 a F9): las alertas de documentos contradictorios, abiertas o resueltas, con
// el filtro y la página en la URL (?estado=resueltas&pagina=2). La API ya filtra y ordena. Solo para
// el ADMIN: la página la envuelve en RequireRole, y la API igual responde 403.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import {
  ApiError,
  PAGE_SIZE,
  describeApiError,
  listConflictAlerts,
  notifyConflictAlertsChanged,
  useApiResource,
} from '@/lib/api';
import type { ApiResource, ConflictAlertPage, ConflictAlertStatus } from '@/lib/api';
import { pageCount, parsePageParam } from '@/lib/documents/pagination';
import { useSession } from '@/lib/session';
import { ConflictAlertCard } from './ConflictAlertCard';
import { ALERTS_PATH } from './ConflictAlertsLink';
import { Pagination } from './Pagination';
import { ResolveAlertDialog } from './ResolveAlertDialog';
import { TEXT_LINK } from './design';

const RESOLVED_QUERY = 'estado=resueltas';

const EMPTY: Record<ConflictAlertStatus, string> = {
  OPEN: 'No hay alertas abiertas. Cuando el asistente encuentre dos documentos que se contradicen, aparecen acá.',
  RESOLVED: 'Todavía no se resolvió ninguna alerta.',
};

const LOADING = <ScreenState kind="loading" label="Cargando las alertas…" />;

// Como los filtros del diseño: la activa en bosque con texto blanco; la otra, blanca con borde.
const PILL = 'inline-flex min-h-12 items-center rounded-full px-5 text-base font-semibold';
const PILL_ACTIVE = `${PILL} bg-bosque text-blanco`;
const PILL_IDLE = `${PILL} border border-borde bg-blanco text-bosque hover:bg-salvia`;

export function ConflictAlertList() {
  const { user, status: sessionStatus } = useSession();
  const params = useSearchParams();
  const status: ConflictAlertStatus = params.get('estado') === 'resueltas' ? 'RESOLVED' : 'OPEN';
  const page = parsePageParam(params.get('pagina'));
  // El diálogo de F8 y el aviso de un 409 (F8).
  const [resolving, setResolving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  const alerts = useApiResource(
    user ? `conflict-alerts?status=${status}&page=${page}&user=${user.id}` : null,
    (signal) => listConflictAlerts(status, page, PAGE_SIZE, signal),
  );

  if (sessionStatus === 'loading') return LOADING;
  if (sessionStatus === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'conflict-alert').message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;

  const openTotal = alerts.status === 'success' ? alerts.data.openTotal : undefined;
  const filters = (
    <nav aria-label="Estado de las alertas" className="flex flex-wrap gap-3">
      <Link
        href={ALERTS_PATH}
        aria-current={status === 'OPEN' ? 'page' : undefined}
        className={status === 'OPEN' ? PILL_ACTIVE : PILL_IDLE}
      >
        {openTotal === undefined ? 'Abiertas' : `Abiertas (${openTotal})`}
      </Link>
      <Link
        href={`${ALERTS_PATH}?${RESOLVED_QUERY}`}
        aria-current={status === 'RESOLVED' ? 'page' : undefined}
        className={status === 'RESOLVED' ? PILL_ACTIVE : PILL_IDLE}
      >
        Resueltas
      </Link>
    </nav>
  );

  return (
    <div className="flex flex-col gap-6">
      {filters}
      {notice && (
        <p role="status" className="rounded-xl bg-durazno px-4 py-3 font-semibold text-durazno-texto">
          {notice}
        </p>
      )}
      <AlertsBody
        alerts={alerts}
        status={status}
        page={page}
        onResolve={(id) => {
          setNotice(null);
          setResolving(id);
        }}
      />
      {resolving && (
        <ResolveAlertDialog
          alertId={resolving}
          open
          onClose={() => setResolving(null)}
          onResolved={() => {
            setResolving(null);
            alerts.reload();
            notifyConflictAlertsChanged();
          }}
          onConflict={(message) => {
            setResolving(null);
            setNotice(message);
            alerts.reload();
            notifyConflictAlertsChanged();
          }}
        />
      )}
    </div>
  );
}

function AlertsBody({
  alerts,
  status,
  page,
  onResolve,
}: {
  alerts: ApiResource<ConflictAlertPage>;
  status: ConflictAlertStatus;
  page: number;
  onResolve: (id: string) => void;
}) {
  if (alerts.status === 'idle' || alerts.status === 'loading') return LOADING;

  if (alerts.status === 'error') {
    const { message, canRetry } = describeApiError(alerts.error, 'conflict-alert');
    return <ScreenState kind="error" message={message} onRetry={canRetry ? alerts.reload : undefined} />;
  }

  const { data, total } = alerts.data;
  if (total === 0) return <ScreenState kind="empty" message={EMPTY[status]} />;

  const extraQuery = status === 'RESOLVED' ? RESOLVED_QUERY : undefined;
  // Una página que no existe, por ejemplo ?pagina=9 con 3 alertas.
  if (data.length === 0) {
    return (
      <ScreenState
        kind="empty"
        message="Esta página no existe"
        action={
          <Link href={extraQuery ? `${ALERTS_PATH}?${extraQuery}` : ALERTS_PATH} className={TEXT_LINK}>
            Ir a la primera página
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-6">
        {data.map((alert) => (
          <li key={alert.id} className="min-w-0">
            <ConflictAlertCard
              alert={alert}
              onResolve={alert.status === 'OPEN' ? () => onResolve(alert.id) : undefined}
            />
          </li>
        ))}
      </ul>
      {pageCount(total, PAGE_SIZE) > 1 && (
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={PAGE_SIZE}
          basePath={ALERTS_PATH}
          extraQuery={extraQuery}
        />
      )}
    </div>
  );
}
