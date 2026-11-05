'use client';

// Detalle de un documento (F6, F8, F9; plan 002, sección 1). La API ya decide si el usuario puede verlo:
// si no, responde 404, igual que si no existiera.
// Spec 003 (plan 003, 6.1): solo el ADMIN ve las acciones del ciclo de vida, si el documento está
// activo, y el historial de versiones, también si está archivado.
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { ApiError, describeApiError, getDocument, useApiResource } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import {
  formatCreatedAt,
  formatDay,
  formatPerson,
  formatReviewDate,
  formatSize,
} from '@/lib/documents/format';
import { useSession } from '@/lib/session';
import { ArchiveDialog } from './ArchiveDialog';
import { ChangeAreasForm } from './ChangeAreasForm';
import { DownloadButton } from './DownloadButton';
import { MarkReviewedForm } from './MarkReviewedForm';
import { NewVersionForm } from './NewVersionForm';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { VersionHistory } from './VersionHistory';
import {
  AreaChips,
  BUTTON_DANGER,
  BUTTON_SECONDARY,
  CARD,
  Card,
  FileBadge,
  FreshnessBar,
  StatusDot,
} from './design';

type Panel = 'areas' | 'version';

// El mismo formato que acepta la API (ParseUUIDPipe). Otro id no puede existir.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Spec 008 (F1): el responsable, las áreas y quien hizo la última revisión vienen en la respuesta.
  const doc = document.data;
  const lastReview = doc.review?.lastReviewedAt
    ? { day: formatDay(doc.review.lastReviewedAt), by: formatPerson(doc.review.lastReviewedBy) }
    : null;
  const version = doc.currentVersion;
  const archived = doc.status === 'ARCHIVED';
  // R11: un archivado no tiene acciones. R1: solo el ADMIN.
  const canModify = isAdmin && !archived;
  // Spec 005 (R6, R9): la revisión, para quien recibe `review` y si está activo.
  const canReview = doc.review !== undefined && !archived;
  const hasSideColumn = canReview || isAdmin;

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
    <div className="flex min-w-0 flex-col gap-6">
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-exito/40 bg-salvia p-4 font-semibold text-texto"
        >
          {notice}
        </p>
      )}

      {/* Dos columnas desde 1024 px; debajo se apilan (skill pispiar-design, responsive). Sin nada
          para la columna lateral, el documento ocupa todo el ancho. */}
      <div
        className={`grid min-w-0 grid-cols-1 gap-6 ${
          hasSideColumn ? 'lg:grid-cols-[minmax(0,1fr)_22.5rem]' : ''
        }`}
      >
        <article className="flex min-w-0 flex-col gap-6">
          <Card className="flex min-w-0 flex-col gap-6">
            <header className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight">
                  {doc.title}
                </h1>
                {isAdmin && archived && <StatusDot tone="gris">Archivado</StatusDot>}
                {/* Spec 005 (F1): solo llega `review` al ADMIN y al responsable (R4). */}
                <ReviewStatusBadge status={doc.review?.status} />
              </div>
              {isAdmin && archived && doc.archivedAt && (
                <p className="text-sm text-texto-suave">
                  Archivado desde {formatDay(doc.archivedAt)}
                </p>
              )}
              {doc.description && (
                <p className="break-words text-lg text-texto-suave">{doc.description}</p>
              )}
            </header>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr] sm:items-baseline">
              <Field label="Áreas">
                <AreaChips areas={doc.areas} />
              </Field>
              <Field label="Responsable">{formatPerson(doc.owner)}</Field>
              <Field label="Fecha de revisión">{formatReviewDate(doc.reviewDate)}</Field>
              {/* R11: cuándo y quién hizo la última revisión; nunca revisado, no se muestra. */}
              {lastReview && (
                <Field label="Última revisión">
                  {lastReview.day}, por {lastReview.by}
                </Field>
              )}
              <Field label="Cargado">{formatCreatedAt(doc.createdAt)}</Field>
              <Field label="Archivo">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <FileBadge fileName={version.originalFileName} />
                  <span className="break-all">{version.originalFileName}</span>
                </span>
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
                  <button
                    type="button"
                    className={BUTTON_SECONDARY}
                    aria-expanded={panel === 'areas'}
                    onClick={() => togglePanel('areas')}
                  >
                    Cambiar áreas
                  </button>
                  <button
                    type="button"
                    className={BUTTON_SECONDARY}
                    aria-expanded={panel === 'version'}
                    onClick={() => togglePanel('version')}
                  >
                    Subir versión nueva
                  </button>
                  <button
                    type="button"
                    className={BUTTON_DANGER}
                    onClick={() => {
                      setNotice(null);
                      setArchiveOpen(true);
                    }}
                  >
                    Archivar
                  </button>
                </>
              )}
            </div>
          </Card>

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
        </article>

        {/* La columna lateral: revisión e historial. */}
        {hasSideColumn && (
          <div className="flex min-w-0 flex-col gap-6">
            {/* Spec 005 (F4, D17): "Marcar como revisado", siempre visible, para quien recibe `review`
                (ADMIN o responsable, R6) y solo si el documento está activo (R9). */}
            {canReview && doc.review && (
              <ActionPanel title="Revisión">
                {/* El color sale del estado que decide la API; no se recalcula. */}
                {doc.review.status && (
                  <FreshnessBar
                    status={doc.review.status}
                    reviewDate={doc.reviewDate}
                    since={doc.review.lastReviewedAt ?? doc.createdAt}
                  />
                )}
                <MarkReviewedForm documentId={doc.id} onDone={() => finish('Revisión registrada')} />
              </ActionPanel>
            )}

            {/* R12: el historial solo para el ADMIN; los demás roles no lo ven ni lo piden. */}
            {isAdmin && (
              <VersionHistory documentId={doc.id} refreshKey={`${version.id}:${doc.status}`} />
            )}
          </div>
        )}
      </div>

      {canModify && (
        <ArchiveDialog
          documentId={doc.id}
          open={archiveOpen}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => finish('Documento archivado')}
        />
      )}
    </div>
  );
}

// Un panel de acción como tarjeta; en el celular ocupa todo el ancho (F10).
function ActionPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-label={title} className="flex min-w-0 flex-col gap-6">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-sm text-texto-suave">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export function DocumentDetailSkeleton() {
  return (
    <div aria-hidden="true" className={`${CARD} flex animate-pulse flex-col gap-4 p-8`}>
      <div className="h-10 w-2/3 rounded-lg bg-borde" />
      <div className="h-4 w-full rounded-lg bg-borde" />
      <div className="h-4 w-1/2 rounded-lg bg-borde" />
      <div className="h-4 w-1/3 rounded-lg bg-borde" />
      <div className="h-12 w-36 rounded-xl bg-borde" />
    </div>
  );
}
