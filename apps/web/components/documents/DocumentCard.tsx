// Tarjeta de un documento en el listado (F7). Desde la spec 008, los nombres del responsable y de las
// áreas vienen en la respuesta (F1), con "(inactivo)" o "(inactiva)" si corresponde (F2).
// Toda la tarjeta lleva al detalle: el enlace del título se estira sobre ella (LIST_CARD_LINK). Lo que
// tenga que seguir usable encima va en una capa LIST_CARD_LAYER.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DocumentSummary } from '@/lib/api';
import { formatCreatedAt, formatPerson, formatReviewDate } from '@/lib/documents/format';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { AreaChips, FileBadge, StatusDot } from './design';
import { LIST_CARD, LIST_CARD_LAYER, LIST_CARD_LINK, META_LABEL } from './list-design';

interface DocumentCardProps {
  document: DocumentSummary;
  isAdmin: boolean;
  // Spec 004: lo que va al final de la tarjeta, por ejemplo el fragmento de un resultado de búsqueda.
  children?: ReactNode;
}

export function DocumentCard({ document, isAdmin, children }: DocumentCardProps) {
  const fileName = document.currentVersion.originalFileName;

  return (
    <article className={`${LIST_CARD} flex h-full min-w-0 flex-col gap-5 p-6`}>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="min-w-0 text-xl leading-snug font-bold">
          {/* Recortado para no romper la tarjeta; el texto completo queda en title (caso borde). */}
          <Link href={`/documentos/${document.id}`} title={document.title} className={LIST_CARD_LINK}>
            {document.title}
          </Link>
        </h2>
        <div className="flex min-w-0 items-center gap-2">
          <FileBadge fileName={fileName} />
          <p title={fileName} className="truncate text-sm text-texto-suave">
            {fileName}
          </p>
        </div>
        {/* span y no div: el estado queda en la misma cabecera (div) que el título. */}
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 empty:hidden">
          {/* Solo el ADMIN recibe archivados: los demás roles ven solo documentos activos. */}
          {isAdmin && document.status === 'ARCHIVED' && <StatusDot tone="gris">Archivado</StatusDot>}
          {/* Spec 005 (F1): solo llega `review` al ADMIN y al responsable (R4). */}
          <ReviewStatusBadge status={document.review?.status} />
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-borde pt-4 text-sm">
        <div className="col-span-2 flex min-w-0 flex-col gap-1">
          <dt className={META_LABEL}>Responsable</dt>
          <dd className="min-w-0 break-words">{formatPerson(document.owner)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={META_LABEL}>Revisión</dt>
          <dd className="tabular-nums">{formatReviewDate(document.reviewDate)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={META_LABEL}>Cargado</dt>
          <dd className="tabular-nums">{formatCreatedAt(document.createdAt)}</dd>
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-1">
          <dt className={META_LABEL}>Áreas</dt>
          <dd className="min-w-0 break-words">
            <AreaChips areas={document.areas} />
          </dd>
        </div>
      </dl>
      {children && <div className={`${LIST_CARD_LAYER} mt-auto`}>{children}</div>}
    </article>
  );
}
