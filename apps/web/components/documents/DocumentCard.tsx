// Tarjeta de un documento en el listado (F7). Recibe los nombres ya resueltos: la API manda solo IDs (Q1)
// y el listado los pide una vez para toda la página.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DocumentSummary } from '@/lib/api';
import { formatCreatedAt, formatReviewDate } from '@/lib/documents/format';
import { ReviewStatusBadge } from './ReviewStatusBadge';

interface DocumentCardProps {
  document: DocumentSummary;
  // Nombre de cada área, por ID.
  areaNames: Record<string, string>;
  ownerName?: string;
  isAdmin: boolean;
  // Spec 004: lo que va al final de la tarjeta, por ejemplo el fragmento de un resultado de búsqueda.
  children?: ReactNode;
}

const MISSING = '—';

export function DocumentCard({
  document,
  areaNames,
  ownerName,
  isAdmin,
  children,
}: DocumentCardProps) {
  const areas = document.areaIds.map((id) => areaNames[id] ?? MISSING).join(', ');
  const fileName = document.currentVersion.originalFileName;

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold">
          {/* Recortado para no romper la tarjeta; el texto completo queda en title (caso borde). */}
          <Link
            href={`/documentos/${document.id}`}
            title={document.title}
            className="block truncate text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-400"
          >
            {document.title}
          </Link>
        </h2>
        {/* Solo el ADMIN recibe archivados: los demás roles ven solo documentos activos. */}
        {isAdmin && document.status === 'ARCHIVED' && (
          <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
            Archivado
          </span>
        )}
        {/* Spec 005 (F1): solo llega `review` al ADMIN y al responsable (R4). */}
        <ReviewStatusBadge status={document.review?.status} />
      </div>

      <p title={fileName} className="truncate text-sm text-zinc-600 dark:text-zinc-400">
        {fileName}
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500 dark:text-zinc-400">Áreas</dt>
        <dd className="min-w-0 break-words">{areas || MISSING}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Responsable</dt>
        <dd className="min-w-0 break-words">{ownerName ?? MISSING}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Revisión</dt>
        <dd>{formatReviewDate(document.reviewDate)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Cargado</dt>
        <dd>{formatCreatedAt(document.createdAt)}</dd>
      </dl>
      {children}
    </article>
  );
}
