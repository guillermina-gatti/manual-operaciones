// Un documento en la vista Tarjetas: la hoja grande con el tipo, el título, la versión, el estado de
// revisión y "Actualizado hace X · área". Debajo, chico, el responsable (spec 008, F1).
// Como en la Lista: un article con el título en h2 y un único enlace, estirado sobre la tarjeta.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DocumentSummary } from '@/lib/api';
import { formatArea, formatAreas, formatPerson } from '@/lib/documents/format';
import { withView } from '@/lib/documents/view';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { UpdatedAt, updatedAtOf } from './UpdatedAt';
import { StatusDot } from './design';
import {
  FileTypeIcon,
  LIST_CARD,
  LIST_CARD_LAYER,
  TILE_LINK,
  VERSION_CHIP,
  fileExtension,
} from './list-design';

interface DocumentTileProps {
  document: DocumentSummary;
  isAdmin: boolean;
  now: Date;
  // Lo que va al pie: el fragmento de un resultado de búsqueda.
  children?: ReactNode;
}

// La primera área y cuántas más: "Ventas +1". Todas, en title.
function areaSummary(document: DocumentSummary): string {
  const [first, ...rest] = document.areas;
  if (!first) return '—';
  return rest.length > 0 ? `${formatArea(first)} +${rest.length}` : formatArea(first);
}

export function DocumentTile({ document, isAdmin, now, children }: DocumentTileProps) {
  const { currentVersion } = document;

  return (
    <article className={`${LIST_CARD} flex h-full min-w-0 flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <FileTypeIcon fileName={currentVersion.originalFileName} size="lg" />
        <span className="sr-only">Archivo {fileExtension(currentVersion.originalFileName)}</span>
        <span className={VERSION_CHIP}>
          <span aria-hidden="true">v{currentVersion.versionNumber}</span>
          <span className="sr-only">Versión {currentVersion.versionNumber}</span>
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="min-w-0 text-lg leading-snug font-bold">
          {/* Lleva la vista al detalle, así "Volver a Documentos" vuelve a las Tarjetas. */}
          <Link
            href={withView(`/documentos/${document.id}`, 'tarjetas')}
            title={document.title}
            className={TILE_LINK}
          >
            {document.title}
          </Link>
        </h2>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 empty:hidden">
          {/* Solo el ADMIN recibe archivados; la marca de revisión solo llega al ADMIN y al
              responsable (spec 005, R4). */}
          {isAdmin && document.status === 'ARCHIVED' && <StatusDot tone="gris">Archivado</StatusDot>}
          <ReviewStatusBadge status={document.review?.status} />
        </span>
      </div>

      <div className="mt-auto flex min-w-0 flex-col gap-1 text-sm text-texto-suave">
        <p className="min-w-0 truncate">
          Actualizado <UpdatedAt value={updatedAtOf(document)} now={now} />
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, en </span>
          <span title={formatAreas(document.areas)}>{areaSummary(document)}</span>
        </p>
        <p className="min-w-0 truncate" title={formatPerson(document.owner)}>
          Responsable: {formatPerson(document.owner)}
        </p>
      </div>

      {children && <div className={LIST_CARD_LAYER}>{children}</div>}
    </article>
  );
}
