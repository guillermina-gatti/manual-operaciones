'use client';

// La sección "Versiones" del detalle (spec 003, R12; plan 003, 6.5 y D11). Solo la ve el ADMIN, también
// con el documento archivado (D10). Va en la columna principal, debajo de los datos, con una línea que
// explica qué es y, si el documento está activo, "Subir versión nueva" (su formulario se abre adentro).
// La lista empieza cerrada y se pide recién al abrir "Historial de versiones": el detalle no hace un
// pedido de más. Una fila compacta por versión, de la más nueva a la más vieja; se ven las 3 más nuevas
// y "Ver todas" despliega el resto, que ya vino en el mismo pedido.
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeApiError, listVersions, useApiResource } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/api';
import { formatCreatedAt, formatPerson } from '@/lib/documents/format';
import { DownloadButton } from './DownloadButton';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { HINT, StatusDot, TEXT_LINK } from './design';
import { LIST_BUTTON_SECONDARY, LIST_PANEL } from './list-design';

// Cuántas versiones se ven antes de "Ver todas".
export const VISIBLE_VERSIONS = 3;

interface VersionHistoryProps {
  documentId: string;
  // Cambia cuando el documento cambia (por ejemplo, la versión vigente): vuelve a pedir el historial.
  refreshKey?: string;
  // Cómo abre los enlaces de descarga (los tests pasan la suya, como en DownloadButton).
  openUrl?: (url: string) => void;
  // "Subir versión nueva": solo con el documento activo. El detalle decide si está abierto, así sigue
  // habiendo un solo panel abierto por vez (D8).
  upload?: {
    open: boolean;
    onToggle: () => void;
    // El formulario (NewVersionForm), que se muestra adentro de la sección al abrirlo.
    form: ReactNode;
  };
}

export function VersionHistory({ documentId, refreshKey = '', openUrl, upload }: VersionHistoryProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Una vez abierta, el pedido queda hecho: cerrarla y abrirla no vuelve a pedir.
  const [requested, setRequested] = useState(false);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`${LIST_PANEL} @container flex min-w-0 flex-col gap-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <h2 id={`${id}-title`} className="text-xl font-bold">
            Versiones
          </h2>
          <p className={HINT}>
            Cada vez que se sube un archivo nuevo, el anterior queda guardado acá. La vigente es la que
            se descarga arriba.
          </p>
        </div>
        {upload && (
          <button
            type="button"
            className={LIST_BUTTON_SECONDARY}
            aria-expanded={upload.open}
            onClick={upload.onToggle}
          >
            Subir versión nueva
          </button>
        )}
      </div>

      {/* El formulario, adentro de la sección. Conserva su región con nombre (los avisos de error se
          buscan dentro de ella). */}
      {upload?.open && (
        <section
          aria-label="Subir versión nueva"
          className="flex min-w-0 flex-col gap-4 rounded-xl border border-borde bg-fondo p-4 sm:p-5"
        >
          <h3 className="text-lg font-bold">Subir versión nueva</h3>
          {upload.form}
        </section>
      )}

      <div className="flex min-w-0 flex-col border-t border-borde pt-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setOpen((value) => !value);
            setRequested(true);
          }}
          className="-mx-2 inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-2 font-semibold text-bosque transition-colors hover:bg-salvia focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja motion-reduce:transition-none"
        >
          {/* Una sola flecha que gira al abrir; quieta si se pide menos movimiento. */}
          <span
            aria-hidden="true"
            className={`inline-block text-naranja transition-transform duration-200 motion-reduce:transition-none ${
              open ? 'rotate-90' : ''
            }`}
          >
            ▸
          </span>
          Historial de versiones
        </button>
        <div id={`${id}-panel`} hidden={!open}>
          {requested && (
            <HistoryContent documentId={documentId} refreshKey={refreshKey} openUrl={openUrl} />
          )}
        </div>
      </div>
    </section>
  );
}

function HistoryContent({
  documentId,
  refreshKey,
  openUrl,
}: Required<Pick<VersionHistoryProps, 'documentId' | 'refreshKey'>> &
  Pick<VersionHistoryProps, 'openUrl'>) {
  const versions = useApiResource(`versions:${documentId}:${refreshKey}`, (signal) =>
    listVersions(documentId, signal),
  );
  const [showAll, setShowAll] = useState(false);

  if (versions.status === 'loading' || versions.status === 'idle') {
    return <ScreenState kind="loading" label="Cargando el historial…" />;
  }
  if (versions.status === 'error') {
    const { message, canRetry } = describeApiError(versions.error, 'detail');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? versions.reload : undefined} />
    );
  }

  const all = versions.data.data;
  const shown = showAll ? all : all.slice(0, VISIBLE_VERSIONS);
  const hasMore = all.length > VISIBLE_VERSIONS;

  // Spec 008 (P3, F1): quien subió cada versión viene en la respuesta.
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Versiones" className="flex flex-col divide-y divide-borde">
        {shown.map((version) => (
          <VersionRow
            key={version.id}
            documentId={documentId}
            version={version}
            uploadedBy={formatPerson(version.uploadedBy)}
            openUrl={openUrl}
          />
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          className={`${TEXT_LINK} inline-flex min-h-11 items-center self-start`}
        >
          {showAll ? 'Ver menos' : `Ver todas (${all.length})`}
        </button>
      )}
    </div>
  );
}

// Una fila compacta: número, estado y procesamiento arriba; el archivo; la fecha y quién la subió; y la
// descarga con ícono a la derecha. La misma fila en el celular: solo se acomodan las líneas.
function VersionRow({
  documentId,
  version,
  uploadedBy,
  openUrl,
}: {
  documentId: string;
  version: VersionHistoryItem;
  uploadedBy: string;
  openUrl?: (url: string) => void;
}) {
  const current = version.status === 'CURRENT';
  return (
    <li className="flex min-w-0 items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-bold tabular-nums">Versión {version.versionNumber}</h3>
          {/* El estado con punto y palabra: el color nunca va solo. */}
          <StatusDot tone={current ? 'exito' : 'gris'}>{current ? 'Vigente' : 'Reemplazada'}</StatusDot>
          <ProcessingStatusBadge status={version.processingStatus} />
        </div>
        <span title={version.originalFileName} className="truncate text-sm">
          {version.originalFileName}
        </span>
        <span className="text-xs text-texto-suave tabular-nums">
          {formatCreatedAt(version.createdAt)} · Subida por {uploadedBy}
        </span>
      </div>
      <div className="shrink-0">
        <DownloadButton
          documentId={documentId}
          versionId={version.id}
          label={`Descargar la versión ${version.versionNumber}`}
          openUrl={openUrl}
          icon
        />
      </div>
    </li>
  );
}
