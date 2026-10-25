'use client';

// Detalle de un documento (F6, F8, F9; plan 002, sección 1). La API ya decide si el usuario puede verlo:
// si no, responde 404, igual que si no existiera.
// Spec 003 (plan 003, 6.1): solo el ADMIN ve las acciones del ciclo de vida, si el documento está
// activo, y el historial de versiones, también si está archivado.
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { ApiError, describeApiError, getDocument, useApiResource } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { areasDirectory, usersDirectory } from '@/lib/directory';
import {
  COMPANY_TIME_ZONE,
  formatCreatedAt,
  formatReviewDate,
  formatSize,
} from '@/lib/documents/format';
import { useSession } from '@/lib/session';
import { ArchiveDialog } from './ArchiveDialog';
import { ChangeAreasForm } from './ChangeAreasForm';
import { DownloadButton } from './DownloadButton';
import { NewVersionForm } from './NewVersionForm';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { VersionHistory } from './VersionHistory';

type Panel = 'areas' | 'version';

// "Archivado desde 23/10/2026": el día en Buenos Aires.
const archivedDateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: COMPANY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// El mismo formato que acepta la API (ParseUUIDPipe). Otro id no puede existir.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MISSING = '—';
const NOT_FOUND = describeApiError(new ApiError(404), 'detail').message;

const LOADING = (
  <ScreenState kind="loading" label="Cargando el documento…">
    <DocumentDetailSkeleton />
  </ScreenState>
);

export function DocumentDetail() {
  const { user, status } = useSession();
  const { id } = useParams<{ id: string }>();
  const validId = UUID.test(id);
  const isAdmin = user?.role === 'ADMIN';
  // Spec 003: un panel abierto por vez, el diálogo de archivo y el aviso de la última acción.
  const [panel, setPanel] = useState<Panel | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Un id que no es UUID no se pide: la API respondería 400 (F9).
  const document = useApiResource(user && validId ? `document:${id}:${user.id}` : null, (signal) =>
    getDocument(id, signal),
  );
  const ownerId = document.status === 'success' ? document.data.ownerId : null;
  const areas = useApiResource(user && validId ? 'areas' : null, () => areasDirectory.listAreas());
  const owners = useApiResource(ownerId ? `owner:${ownerId}` : null, () =>
    usersDirectory.getNames([ownerId!]),
  );

  if (status === 'loading') return LOADING;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'detail').message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;
  if (!validId) return <ScreenState kind="error" message={NOT_FOUND} />;

  if (document.status === 'loading' || document.status === 'idle') return LOADING;

  if (document.status === 'error') {
    const { message, canRetry } = describeApiError(document.error, 'detail');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? document.reload : undefined} />
    );
  }

  // Se espera a los nombres para no mostrar "—" un instante; si fallan, se muestra "—".
  if (areas.status === 'loading' || owners.status === 'loading') return LOADING;

  const doc = document.data;
  const areaNames = Object.fromEntries(
    (areas.status === 'success' ? areas.data : []).map((area) => [area.id, area.name]),
  );
  const ownerName = owners.status === 'success' ? owners.data[doc.ownerId] : undefined;
  const version = doc.currentVersion;
  const archived = doc.status === 'ARCHIVED';
  // R11: un archivado no tiene acciones. R1: solo el ADMIN.
  const canModify = isAdmin && !archived;

  // Después de una acción correcta: se cierra lo abierto, se avisa y se vuelve a pedir el detalle.
  function finish(message: string) {
    setPanel(null);
    setArchiveOpen(false);
    setNotice(message);
    document.reload();
  }
  const togglePanel = (next: Panel) => {
    setNotice(null);
    setPanel((current) => (current === next ? null : next));
  };

  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold">{doc.title}</h1>
          {isAdmin && doc.status === 'ARCHIVED' && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
              Archivado
            </span>
          )}
        </div>
        {isAdmin && archived && doc.archivedAt && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Archivado desde {archivedDateFormat.format(new Date(doc.archivedAt))}
          </p>
        )}
        {doc.description && (
          <p className="break-words text-zinc-700 dark:text-zinc-300">{doc.description}</p>
        )}
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100"
        >
          {notice}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
        <Field label="Áreas">
          {doc.areaIds.map((areaId) => areaNames[areaId] ?? MISSING).join(', ') || MISSING}
        </Field>
        <Field label="Responsable">{ownerName ?? MISSING}</Field>
        <Field label="Fecha de revisión">{formatReviewDate(doc.reviewDate)}</Field>
        <Field label="Cargado">{formatCreatedAt(doc.createdAt)}</Field>
        <Field label="Archivo">
          <span className="break-all">{version.originalFileName}</span>
        </Field>
        <Field label="Tamaño">{formatSize(version.sizeBytes)}</Field>
        {/* Solo el ADMIN ve el estado del procesamiento (F6, P4). */}
        {isAdmin && (
          <Field label="Procesamiento">
            <ProcessingStatusBadge status={version.processingStatus} />
          </Field>
        )}
      </dl>

      {/* El enlace se pide en cada clic, nunca al cargar el detalle (F8). */}
      <div className="flex flex-wrap items-start gap-3">
        <DownloadButton documentId={doc.id} />
        {canModify && (
          <>
            <Button
              variant="secondary"
              aria-expanded={panel === 'areas'}
              onClick={() => togglePanel('areas')}
            >
              Cambiar áreas
            </Button>
            <Button
              variant="secondary"
              aria-expanded={panel === 'version'}
              onClick={() => togglePanel('version')}
            >
              Subir versión nueva
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setNotice(null);
                setArchiveOpen(true);
              }}
            >
              Archivar
            </Button>
          </>
        )}
      </div>

      {/* D8: los paneles van dentro del detalle, de a uno, y ante un error quedan abiertos. */}
      {canModify && panel === 'areas' && (
        <ActionPanel title="Cambiar áreas">
          <ChangeAreasForm
            document={doc}
            onDone={() => finish('Áreas actualizadas')}
            onCancel={() => setPanel(null)}
          />
        </ActionPanel>
      )}
      {canModify && panel === 'version' && (
        <ActionPanel title="Subir versión nueva">
          <NewVersionForm
            document={doc}
            onDone={(updated: DocumentResponse) =>
              finish(`Versión ${updated.currentVersion.versionNumber} cargada`)
            }
            onCancel={() => setPanel(null)}
          />
        </ActionPanel>
      )}
      {canModify && (
        <ArchiveDialog
          documentId={doc.id}
          open={archiveOpen}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => finish('Documento archivado')}
        />
      )}

      {/* R12: el historial solo para el ADMIN; los demás roles no lo ven ni lo piden. */}
      {isAdmin && (
        <VersionHistory documentId={doc.id} refreshKey={`${version.id}:${doc.status}`} />
      )}
    </article>
  );
}

// Un panel de acción debajo de los datos; en el celular ocupa todo el ancho (F10).
function ActionPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export function DocumentDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-11 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}
