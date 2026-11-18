'use client';

// Acceso a "Archivados" con la cantidad (spec 003, R15). Solo para el ADMIN: lo decide quien lo monta
// (DocumentList). Como ConflictAlertsLink: pide un solo documento para leer `total`.
import Link from 'next/link';
import { listArchivedDocuments, useApiResource } from '@/lib/api';
import { BUTTON_SECONDARY } from './design';

export const ARCHIVED_PATH = '/documentos/archivados';

const describeCount = (total: number) =>
  total === 0 ? 'ningún documento' : total === 1 ? '1 documento' : `${total} documentos`;

export function ArchivedLink({ userId }: { userId: string }) {
  // La clave incluye al usuario: al cambiar de sesión se vuelve a pedir.
  const archived = useApiResource(`archived-count:${userId}`, (signal) =>
    listArchivedDocuments(1, 1, signal),
  );

  // Mientras carga, nada: así no aparece y desaparece un "Archivados (…)".
  if (archived.status === 'idle' || archived.status === 'loading') return null;

  // Si falla, el acceso igual, sin número.
  if (archived.status === 'error') {
    return (
      <Link href={ARCHIVED_PATH} className={BUTTON_SECONDARY}>
        Archivados
      </Link>
    );
  }

  const { total } = archived.data;
  return (
    <Link
      href={ARCHIVED_PATH}
      aria-label={`Archivados: ${describeCount(total)}`}
      className={BUTTON_SECONDARY}
    >
      Archivados ({total})
    </Link>
  );
}
