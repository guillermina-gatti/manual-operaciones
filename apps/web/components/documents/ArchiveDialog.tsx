'use client';

// Confirmación para archivar (spec 003, R10, R14, P6; plan 003, 6.4). Un <dialog> nativo con
// showModal(): el navegador resuelve el foco atrapado, Escape y el fondo inerte. Solo existe mientras
// está abierto; el detalle lo cierra al recibir onClose u onArchived.
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { archiveDocument, describeApiError } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';

export const ARCHIVE_CONFIRMATION =
  '¿Seguro que querés archivar este documento? Va a dejar de verse para los demás usuarios y no se puede deshacer.';

interface ArchiveDialogProps {
  documentId: string;
  open: boolean;
  // Cancelar, Escape: se cierra sin pedir nada a la API (E11).
  onClose: () => void;
  // Con el documento archivado (E7).
  onArchived: (document: DocumentResponse) => void;
}

export function ArchiveDialog({ open, ...props }: ArchiveDialogProps) {
  if (!open) return null;
  return <OpenArchiveDialog {...props} />;
}

function OpenArchiveDialog({ documentId, onClose, onArchived }: Omit<ArchiveDialogProps, 'open'>) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corta un segundo clic que llegue antes de que React dibuje el botón deshabilitado.
  const archivingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // "Cancelar" con el foco: un Enter apurado no archiva.
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
  }, []);

  async function archive() {
    if (archivingRef.current) return;
    archivingRef.current = true;
    setArchiving(true);
    setError(null);
    try {
      onArchived(await archiveDocument(documentId));
    } catch (failure) {
      // El diálogo queda abierto con el error adentro.
      setError(describeApiError(failure, 'archive').message);
      archivingRef.current = false;
      setArchiving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onClose={onClose}
      // Mientras archiva, Escape no lo cierra: la respuesta tiene que llegar al detalle.
      onCancel={(event) => {
        if (archivingRef.current) event.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        Archivar documento
      </h2>
      <p id={`${id}-text`} className="mt-2">
        {ARCHIVE_CONFIRMATION}
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button
          data-initial-focus
          variant="secondary"
          disabled={archiving}
          onClick={() => dialogRef.current?.close()}
        >
          Cancelar
        </Button>
        <button
          type="button"
          onClick={archive}
          disabled={archiving}
          aria-busy={archiving}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-700 px-4 font-medium text-white transition-colors hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:text-zinc-950 dark:hover:bg-red-400"
        >
          {archiving ? 'Archivando…' : 'Archivar'}
        </button>
      </div>
    </dialog>
  );
}
