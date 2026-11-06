'use client';

// Encabezado del detalle, como la tarjeta del listado: la hoja grande del tipo de archivo, el título y
// debajo la versión, las marcas, "Actualizado hace X" y las áreas. "Descargar" (la acción principal, un
// único botón) va alineado arriba con el título; en el celular, debajo.
//
// "Ahora" se toma una sola vez. El detalle se dibuja solo en el navegador, después de pedir los datos
// (useApiResource en un efecto): "hace X" nunca forma parte del HTML del servidor.
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DocumentResponse } from '@/lib/api';
import { formatDay } from '@/lib/documents/format';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { UpdatedAt } from './UpdatedAt';
import { AreaChips, StatusDot } from './design';
import { FileTypeIcon, PAGE_SUBTITLE, PAGE_TITLE, VERSION_CHIP } from './list-design';

interface DocumentDetailHeaderProps {
  document: DocumentResponse;
  isAdmin: boolean;
  // La acción principal (Descargar).
  action: ReactNode;
}

export function DocumentDetailHeader({ document: doc, isAdmin, action }: DocumentDetailHeaderProps) {
  const [now] = useState(() => new Date());
  const archived = doc.status === 'ARCHIVED';
  const version = doc.currentVersion;

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <FileTypeIcon fileName={version.originalFileName} size="lg" />
        {/* El h1 y las marcas en el mismo contenedor (spec 005, E2: "Vencido" junto al título). */}
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className={`${PAGE_TITLE} min-w-0 break-words`}>{doc.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-texto-suave">
            {/* "v3" a la vista; para lectores, "Versión vigente: 3" (no "Versión 3": ese texto es del
                historial, que solo ve el ADMIN). */}
            <span className={VERSION_CHIP}>
              <span aria-hidden="true">v{version.versionNumber}</span>
              <span className="sr-only">Versión vigente: {version.versionNumber}</span>
            </span>
            {/* Solo el ADMIN recibe archivados; la marca de revisión solo llega al ADMIN y al
                responsable (spec 005, R4). */}
            {isAdmin && archived && <StatusDot tone="gris">Archivado</StatusDot>}
            <ReviewStatusBadge status={doc.review?.status} />
            <span>
              Actualizado <UpdatedAt value={version.createdAt} now={now} />
            </span>
            <span aria-hidden="true">·</span>
            <span className="sr-only">Áreas: </span>
            <AreaChips areas={doc.areas} />
          </div>
          {isAdmin && archived && doc.archivedAt && (
            <p className="text-sm text-texto-suave">Archivado desde {formatDay(doc.archivedAt)}</p>
          )}
          {doc.description && <p className={`${PAGE_SUBTITLE} break-words`}>{doc.description}</p>}
        </div>
      </div>
      <div className="flex shrink-0">{action}</div>
    </header>
  );
}
