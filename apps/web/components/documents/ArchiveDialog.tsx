'use client';

// Confirmación para archivar (spec 003, R10, R14, P6; plan 003, 6.4). Un <dialog> nativo con
// showModal(): el navegador resuelve el foco atrapado, Escape y el fondo inerte. Solo existe mientras
// está abierto; el detalle lo cierra al recibir onClose u onArchived.
import { useEffect, useId, useRef, useState } from 'react';
import { archiveDocument, describeApiError } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { BUTTON_DANGER, BUTTON_SECONDARY, ERROR_BOX } from './design';

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
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-borde bg-blanco p-8 text-texto shadow-xl backdrop:bg-texto/50"
    >
      <h2 id={`${id}-title`} className="text-2xl font-bold">
        Archivar documento
      </h2>
      <p id={`${id}-text`} className="mt-2">
        {ARCHIVE_CONFIRMATION}
      </p>
      {error && (
        <p role="alert" className={`${ERROR_BOX} mt-4`}>
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className={BUTTON_SECONDARY}
          data-initial-focus
          disabled={archiving}
          onClick={() => dialogRef.current?.close()}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={archive}
          disabled={archiving}
          aria-busy={archiving}
          className={BUTTON_DANGER}
        >
          {archiving ? 'Archivando…' : 'Archivar'}
        </button>
      </div>
    </dialog>
  );
}
