'use client';

// Historial de versiones (spec 003, R12, D10; plan 003, 6.5). Solo lo muestra el detalle al ADMIN.
// Empieza cerrado y pide el historial recién al abrirlo: el detalle no hace un pedido de más.
// Al abrirlo, una línea de tiempo compacta: un punto por versión (verde la vigente, gris las
// reemplazadas), de la más nueva a la más vieja. Muestra las 3 más nuevas; "Ver todas" despliega el
// resto, que ya vino en el mismo pedido.
import { useId, useState } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeApiError, listVersions, useApiResource } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/api';
import { formatCreatedAt, formatPerson } from '@/lib/documents/format';
import { DownloadButton } from './DownloadButton';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { CARD, HINT, TEXT_LINK } from './design';

// Cuántas versiones se ven antes de "Ver todas".
export const VISIBLE_VERSIONS = 3;

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
    <div className="flex flex-col gap-3">
      {/* La línea vertical une los puntos de cada versión. */}
      <ol
        aria-label="Versiones"
        className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-0.5 before:bg-borde before:content-['']"
      >
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
    <li className="relative flex min-w-0 flex-col gap-1.5 pl-7">
      {/* El punto sobre la línea: verde la vigente, gris las reemplazadas (el estado va en texto). */}
      <span
        aria-hidden="true"
        className={`absolute top-1.5 left-0 size-3 rounded-full ring-4 ring-blanco ${
          current ? 'bg-exito' : 'bg-gris-reemplazada'
        }`}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <h3 className="text-base font-bold">Versión {version.versionNumber}</h3>
        <span aria-hidden="true" className="text-texto-suave">
          ·
        </span>
        <span className={current ? 'font-semibold text-chip-area-texto' : 'text-texto-suave'}>
          {current ? 'Vigente' : 'Reemplazada'}
        </span>
        <span aria-hidden="true" className="text-texto-suave">
          ·
        </span>
        <ProcessingStatusBadge status={version.processingStatus} />
      </div>
      <span title={version.originalFileName} className="truncate text-sm font-semibold">
        {version.originalFileName}
      </span>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-xs text-texto-suave">
          {formatCreatedAt(version.createdAt)} · Subida por {uploadedBy}
        </span>
        <DownloadButton
          documentId={documentId}
          versionId={version.id}
          label={`Descargar la versión ${version.versionNumber}`}
          openUrl={openUrl}
          secondary
        />
      </div>
    </li>
  );
}
