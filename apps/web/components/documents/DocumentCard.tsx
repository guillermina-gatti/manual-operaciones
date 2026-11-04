// Tarjeta de un documento en el listado (F7). Desde la spec 008, los nombres del responsable y de las
// áreas vienen en la respuesta (F1), con "(inactivo)" o "(inactiva)" si corresponde (F2).
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DocumentSummary } from '@/lib/api';
import { formatCreatedAt, formatPerson, formatReviewDate } from '@/lib/documents/format';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { AreaChips, CARD, FileBadge, StatusDot } from './design';

interface DocumentCardProps {
  document: DocumentSummary;
  isAdmin: boolean;
  // Spec 004: lo que va al final de la tarjeta, por ejemplo el fragmento de un resultado de búsqueda.
  children?: ReactNode;
}

export function DocumentCard({ document, isAdmin, children }: DocumentCardProps) {
  const fileName = document.currentVersion.originalFileName;

  return (
    <article className={`${CARD} flex h-full min-w-0 flex-col gap-4 p-6`}>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="min-w-0 text-xl font-bold">
          {/* Recortado para no romper la tarjeta; el texto completo queda en title (caso borde). */}
          <Link
            href={`/documentos/${document.id}`}
            title={document.title}
            className="block truncate text-bosque underline-offset-4 hover:underline"
          >
            {document.title}
          </Link>
        </h2>
        {/* span y no div: el estado queda en la misma cabecera (div) que el título. */}
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 empty:hidden">
          {/* Solo el ADMIN recibe archivados: los demás roles ven solo documentos activos. */}
          {isAdmin && document.status === 'ARCHIVED' && <StatusDot tone="gris">Archivado</StatusDot>}
          {/* Spec 005 (F1): solo llega `review` al ADMIN y al responsable (R4). */}
          <ReviewStatusBadge status={document.review?.status} />
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <FileBadge fileName={fileName} />
        <p title={fileName} className="truncate text-sm text-texto-suave">
          {fileName}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
        <dt className="text-texto-suave">Áreas</dt>
        <dd className="min-w-0 break-words">
          <AreaChips areas={document.areas} />
        </dd>
        <dt className="text-texto-suave">Responsable</dt>
        <dd className="min-w-0 break-words">{formatPerson(document.owner)}</dd>
        <dt className="text-texto-suave">Revisión</dt>
        <dd>{formatReviewDate(document.reviewDate)}</dd>
        <dt className="text-texto-suave">Cargado</dt>
        <dd>{formatCreatedAt(document.createdAt)}</dd>
      </dl>
      {children}
    </article>
  );
}
