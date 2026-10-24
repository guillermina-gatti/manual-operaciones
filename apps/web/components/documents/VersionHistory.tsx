'use client';

// Historial de versiones (spec 003, R12, D10; plan 003, 6.5). Solo lo muestra el detalle al ADMIN.
// Empieza cerrado y pide el historial recién al abrirlo: el detalle no hace un pedido de más.
// Una fila por versión, de la más nueva a la más vieja; en el celular cada fila es una tarjeta (F10).
import { useId, useState } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeApiError, listVersions, useApiResource } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/api';
import { usersDirectory } from '@/lib/directory';
import { formatCreatedAt } from '@/lib/documents/format';
import { DownloadButton } from './DownloadButton';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';

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
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setOpen((value) => !value);
            setRequested(true);
          }}
          className="flex min-h-11 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          Historial de versiones
        </button>
      </h2>
      <div id={`${id}-panel`} hidden={!open}>
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

  const uploaderIds =
    versions.status === 'success'
      ? [...new Set(versions.data.data.map((version) => version.uploadedById))]
      : [];
  const names = useApiResource(
    uploaderIds.length > 0 ? `names:${uploaderIds.join(',')}` : null,
    () => usersDirectory.getNames(uploaderIds),
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

  const nameOf = (userId: string) =>
    names.status === 'success' ? (names.data[userId] ?? '—') : names.status === 'error' ? '—' : '…';

  return (
    <ol aria-label="Versiones" className="flex flex-col gap-3">
      {versions.data.data.map((version) => (
        <VersionRow
          key={version.id}
          documentId={documentId}
          version={version}
          uploadedBy={nameOf(version.uploadedById)}
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
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 p-4 sm:grid sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 dark:border-zinc-700">
      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-start">
        <h3 className="font-semibold">Versión {version.versionNumber}</h3>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-sm font-medium ${
            current
              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
              : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
        >
          {current ? 'Vigente' : 'Reemplazada'}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span title={version.originalFileName} className="truncate font-medium">
          {version.originalFileName}
        </span>
        <span className="text-zinc-600 dark:text-zinc-400">
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
      />
    </li>
  );
}
