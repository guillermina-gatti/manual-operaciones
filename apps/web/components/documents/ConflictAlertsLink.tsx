'use client';

// Acceso a "Alertas" con la cantidad de abiertas (spec 011, F5). Solo para el ADMIN: lo decide quien
// lo monta (DocumentList). Como PendingReviewLink: pide una sola alerta para leer openTotal.
import Link from 'next/link';
import { listConflictAlerts, useApiResource } from '@/lib/api';
import { BUTTON_SECONDARY } from './design';

export const ALERTS_PATH = '/documentos/alertas';

const describeOpen = (total: number) =>
  total === 0 ? 'ninguna abierta' : total === 1 ? '1 abierta' : `${total} abiertas`;

export function ConflictAlertsLink({ userId }: { userId: string }) {
  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  const open = useApiResource(`conflict-alerts-count:${userId}`, (signal) =>
    listConflictAlerts('OPEN', 1, 1, signal),
  );

  // Mientras carga, nada: así no aparece y desaparece un "Alertas (…)".
  if (open.status === 'idle' || open.status === 'loading') return null;

  // Si falla, el acceso igual, sin número.
  if (open.status === 'error') {
    return (
      <Link href={ALERTS_PATH} className={BUTTON_SECONDARY}>
        Alertas
      </Link>
    );
  }

  const { openTotal } = open.data;
  return (
    <Link href={ALERTS_PATH} aria-label={`Alertas: ${describeOpen(openTotal)}`} className={BUTTON_SECONDARY}>
      Alertas ({openTotal})
    </Link>
  );
}
