'use client';

// Historial de versiones (spec 003, R12, D10; plan 003, 6.5). Solo lo muestra el detalle al ADMIN.
// Empieza cerrado y pide el historial recién al abrirlo: el detalle no hace un pedido de más.
// Una fila por versión, de la más nueva a la más vieja, unidas por una línea vertical (diseño
// "Historia de versiones"): "● Vigente" en verde y "● Reemplazada" en gris.
import { useId, useState } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeApiError, listVersions, useApiResource } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/api';
import { formatCreatedAt, formatPerson } from '@/lib/documents/format';
import { DownloadButton } from './DownloadButton';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { CARD, FileBadge, HINT, StatusDot } from './design';

interface VersionHistoryProps {
  documentId: string;
  // Cambia cuando el documento cambia (por ejemplo, la versión vigente): vuelve a pedir el historial.
  refreshKey?: string;
  // Cómo abre los enlaces de descarga (los tests pasan la suya, como en DownloadButton).
  openUrl?: (url: string) => void;
}

export function VersionHistory({ documentId, refreshKey = '', openUrl }: VersionHistoryProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Una vez abierta, el pedido queda hecho: cerrarla y abrirla no vuelve a pedir.
  const [requested, setRequested] = useState(false);

  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-4 p-6`}>
      <h2 className="text-xl font-bold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setOpen((value) => !value);
            setRequested(true);
          }}
          className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-salvia motion-reduce:transition-none"
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
      </h2>
      <div id={`${id}-panel`} hidden={!open} className="flex flex-col gap-4">
        <p className={HINT}>
          La vigente es la que se descarga desde el documento; las reemplazadas quedan acá para
          consultar.
        </p>
        {requested && (
          <HistoryContent documentId={documentId} refreshKey={refreshKey} openUrl={openUrl} />
        )}
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

  if (versions.status === 'loading' || versions.status === 'idle') {
    return <ScreenState kind="loading" label="Cargando el historial…" />;
  }
  if (versions.status === 'error') {
    const { message, canRetry } = describeApiError(versions.error, 'detail');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? versions.reload : undefined} />
    );
  }

  // Spec 008 (P3, F1): quien subió cada versión viene en la respuesta.
  return (
    // La línea vertical une los puntos de cada versión.
    <ol aria-label="Versiones" className="flex flex-col gap-6 border-l-2 border-borde pl-5">
      {versions.data.data.map((version) => (
        <VersionRow
          key={version.id}
          documentId={documentId}
          version={version}
          uploadedBy={formatPerson(version.uploadedBy)}
          openUrl={openUrl}
        />
      ))}
    </ol>
  );
}

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
    <li className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-bold">Versión {version.versionNumber}</h3>
        <StatusDot tone={current ? 'exito' : 'gris'}>{current ? 'Vigente' : 'Reemplazada'}</StatusDot>
      </div>
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <FileBadge fileName={version.originalFileName} />
          <span title={version.originalFileName} className="truncate font-semibold">
            {version.originalFileName}
          </span>
        </span>
        <span className="text-texto-suave">
          {formatCreatedAt(version.createdAt)} · Subida por {uploadedBy}
        </span>
        <span>
          <ProcessingStatusBadge status={version.processingStatus} />
        </span>
      </div>
      <DownloadButton
        documentId={documentId}
        versionId={version.id}
        label={`Descargar la versión ${version.versionNumber}`}
        openUrl={openUrl}
        secondary
      />
    </li>
  );
}
