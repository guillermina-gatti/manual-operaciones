'use client';

// Acceso a "Por revisar" con la cantidad de pendientes (spec 005, F2; plan 005, 7.3). Pide una sola
// tarjeta para leer `total` e `isReviewer` (D18): lo ve el ADMIN y quien sea responsable de algún
// documento, aunque no tenga pendientes (D19).
import Link from 'next/link';
import { listPendingReview, useApiResource } from '@/lib/api';
import { BUTTON_SECONDARY } from './design';

interface PendingReviewLinkProps {
  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  userId: string;
  isAdmin: boolean;
}

// Con forma de botón secundario del diseño, 48 px de alto (F10 del plan 002).
const LINK_SECONDARY = BUTTON_SECONDARY;

const describeCount = (total: number) =>
  total === 0 ? 'ningún documento' : total === 1 ? '1 documento' : `${total} documentos`;

export function PendingReviewLink({ userId, isAdmin }: PendingReviewLinkProps) {
  const pending = useApiResource(`pending-review-count:${userId}`, (signal) =>
    listPendingReview(1, 1, signal),
  );

  // Mientras carga, nada: así no aparece y desaparece un "Por revisar (…)".
  if (pending.status === 'idle' || pending.status === 'loading') return null;

  // Si falla, el ADMIN igual tiene el acceso, sin número; de los demás no se sabe si son responsables.
  if (pending.status === 'error') {
    return isAdmin ? (
      <Link href="/documentos/por-revisar" className={LINK_SECONDARY}>
        Por revisar
      </Link>
    ) : null;
  }

  const { total, isReviewer } = pending.data;
  if (!isReviewer) return null;
  return (
    <Link
      href="/documentos/por-revisar"
      aria-label={`Por revisar: ${describeCount(total)}`}
      className={LINK_SECONDARY}
    >
      Por revisar ({total})
    </Link>
  );
}
