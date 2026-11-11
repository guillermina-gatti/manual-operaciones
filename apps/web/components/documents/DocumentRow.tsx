// Un documento en la vista Lista (estilo Drive): Nombre · Área · Responsable · Revisión · Actualizado.
// Cada dato se dibuja una sola vez: desde md: son columnas alineadas con los encabezados (misma grilla,
// ROW_GRID); en el celular, los mismos elementos se apilan en una línea bajo el título.
// Como la tarjeta: es un article con el título en h2 y un único enlace, estirado sobre la fila.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DocumentSummary } from '@/lib/api';
import { formatPerson, formatReviewDate } from '@/lib/documents/format';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { UpdatedAt, updatedAtOf } from './UpdatedAt';
import { AreaChips, StatusDot } from './design';
import { FileTypeIcon, LIST_CARD_LAYER, ROW, ROW_GRID, ROW_LINK, fileExtension } from './list-design';

// En el celular, un punto medio entre datos; desde md:, nada (son columnas).
const CELL =
  'flex min-w-0 items-center gap-2 max-md:not-first:before:text-texto-suave max-md:not-first:before:content-["·"]';

interface DocumentRowProps {
  document: DocumentSummary;
  isAdmin: boolean;
  now: Date;
  // Lo que va debajo, a lo ancho: el fragmento de un resultado de búsqueda.
  children?: ReactNode;
}

export function DocumentRow({ document, isAdmin, now, children }: DocumentRowProps) {
  const fileName = document.currentVersion.originalFileName;

  return (
    <article className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <FileTypeIcon fileName={fileName} size="sm" />
        <h2 className="min-w-0 text-base">
          {/* Recortado para no romper la fila; el texto completo queda en title (caso borde). */}
          <Link href={`/documentos/${document.id}`} title={document.title} className={ROW_LINK}>
            {document.title}
          </Link>
        </h2>
        <span className="sr-only">Archivo {fileExtension(fileName)}</span>
      </div>

      <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-10 text-sm text-texto-suave md:col-span-4 md:grid md:grid-cols-subgrid md:pl-0 md:text-texto">
        <div className={CELL}>
          <dt className="sr-only">Áreas</dt>
          <dd className="min-w-0">
            <AreaChips areas={document.areas} />
          </dd>
        </div>
        <div className={CELL}>
          <dt className="sr-only">Responsable</dt>
          <dd className="min-w-0 truncate" title={formatPerson(document.owner)}>
            {formatPerson(document.owner)}
          </dd>
        </div>
        <div className={CELL}>
          <dt className="sr-only">Revisión</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-x-2 md:flex-col md:items-start md:gap-0.5">
            {/* Solo el ADMIN recibe archivados; la marca de revisión solo llega al ADMIN y al
                responsable (spec 005, R4). */}
            {isAdmin && document.status === 'ARCHIVED' && <StatusDot tone="gris">Archivado</StatusDot>}
            <ReviewStatusBadge status={document.review?.status} />
            <span className="tabular-nums">
              <span aria-hidden="true" className="md:hidden">
                Revisar el{' '}
              </span>
              {formatReviewDate(document.reviewDate)}
            </span>
          </dd>
        </div>
        <div className={CELL}>
          <dt className="sr-only">Actualizado</dt>
          <dd className="min-w-0">
            <span aria-hidden="true" className="md:hidden">
              Actualizado{' '}
            </span>
            <UpdatedAt value={updatedAtOf(document)} now={now} />
          </dd>
        </div>
      </dl>

      {children && (
        // A lo ancho, debajo del título y alineado con él (el fragmento ya trae su línea de arriba).
        <div className={`${LIST_CARD_LAYER} pl-10 md:col-span-full [&>div]:border-t-0 [&>div]:pt-1`}>
          {children}
        </div>
      )}
    </article>
  );
}

// Los encabezados de las columnas, con la misma grilla que las filas. Solo visuales: cada fila ya
// dice el nombre de cada dato (dt sr-only).
export function DocumentRowHeader() {
  return (
    <div
      aria-hidden="true"
      className={`hidden border-b border-borde bg-fondo px-4 py-2.5 text-xs font-semibold tracking-wide text-texto-suave uppercase md:grid ${ROW_GRID}`}
    >
      <span className="pl-10">Nombre</span>
      <span>Área</span>
      <span>Responsable</span>
      <span>Revisión</span>
      <span>Actualizado</span>
    </div>
  );
}
