'use client';

// Acceso a "Por revisar" con la cantidad de pendientes (spec 005, F2; plan 005, 7.3). Pide una sola
// tarjeta para leer `total` e `isReviewer` (D18): lo ve el ADMIN y quien sea responsable de algún
// documento, aunque no tenga pendientes (D19).
import Link from 'next/link';
import { listPendingReview, useApiResource } from '@/lib/api';

interface PendingReviewLinkProps {
  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  userId: string;
  isAdmin: boolean;
}

// Con forma de botón secundario y 44 px de alto, como Button (F10 del plan 002).
const LINK_SECONDARY =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 font-medium text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800';

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
