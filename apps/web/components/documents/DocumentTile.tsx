// Un documento en la vista Tarjetas, en una sola fila. A la izquierda, el título (hasta dos líneas), el
// estado de revisión, "Actualizado hace X · área" y el responsable (spec 008, F1), a 10 px entre sí. A
// la derecha, un bloque que no se achica: la hoja del tipo de archivo (48×56) y, debajo, la versión.
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
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <h2 className="min-w-0 text-lg leading-snug font-bold break-words">
            {/* Lleva la vista al detalle, así la ruta ("Documentos › …") vuelve a las Tarjetas. */}
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
          <p className="min-w-0 truncate text-sm text-texto-suave">
            Actualizado <UpdatedAt value={updatedAtOf(document)} now={now} />
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, en </span>
            <span title={formatAreas(document.areas)}>{areaSummary(document)}</span>
          </p>
          <p className="min-w-0 truncate text-sm text-texto-suave" title={formatPerson(document.owner)}>
            Responsable: {formatPerson(document.owner)}
          </p>
        </div>

        {/* No se achica: el título se acomoda en lo que queda. */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <FileTypeIcon fileName={currentVersion.originalFileName} size="md" />
          <span className="sr-only">Archivo {fileExtension(currentVersion.originalFileName)}</span>
          <span className={VERSION_CHIP}>
            <span aria-hidden="true">v{currentVersion.versionNumber}</span>
            <span className="sr-only">Versión {currentVersion.versionNumber}</span>
          </span>
        </div>
      </div>

      {children && <div className={`${LIST_CARD_LAYER} mt-auto`}>{children}</div>}
    </article>
  );
}
