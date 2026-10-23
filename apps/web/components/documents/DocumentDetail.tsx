'use client';

// Detalle de un documento (F6, F8, F9; plan 002, sección 1). La API ya decide si el usuario puede verlo:
// si no, responde 404, igual que si no existiera.
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { ApiError, describeApiError, getDocument, useApiResource } from '@/lib/api';
import { areasDirectory, usersDirectory } from '@/lib/directory';
import { formatCreatedAt, formatReviewDate } from '@/lib/documents/format';
import { useSession } from '@/lib/session';
import { DownloadButton } from './DownloadButton';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';

// El mismo formato que acepta la API (ParseUUIDPipe). Otro id no puede existir.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MISSING = '—';
const NOT_FOUND = describeApiError(new ApiError(404), 'detail').message;

const sizeFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

// 2097152 → "2 MB".
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

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
        {doc.description && (
          <p className="break-words text-zinc-700 dark:text-zinc-300">{doc.description}</p>
        )}
      </header>

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
      <DownloadButton documentId={doc.id} />
    </article>
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
