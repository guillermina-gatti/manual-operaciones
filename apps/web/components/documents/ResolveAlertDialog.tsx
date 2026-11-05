'use client';

// "Marcar la alerta como resuelta" (spec 011, F8, R15, D12), con una nota opcional. Un <dialog> nativo
// con showModal(), como ArchiveDialog: el navegador resuelve el foco atrapado, Escape y el fondo
// inerte. Solo existe mientras está abierto.
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, describeApiError, resolveConflictAlert } from '@/lib/api';
import type { ConflictAlert } from '@/lib/api';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, ERROR_BOX, HINT, INPUT, LABEL } from './design';

export const NOTE_MAX = 500;

interface ResolveAlertDialogProps {
  alertId: string;
  open: boolean;
  // Cancelar, Escape: se cierra sin pedir nada a la API.
  onClose: () => void;
  onResolved: (alert: ConflictAlert) => void;
  // 409: otra persona ya la resolvió. Quien lo monta muestra el aviso y vuelve a pedir la lista.
  onConflict: (message: string) => void;
}

export function ResolveAlertDialog({ open, ...props }: ResolveAlertDialogProps) {
  if (!open) return null;
  return <OpenResolveAlertDialog {...props} />;
}

function OpenResolveAlertDialog({ alertId, onClose, onResolved, onConflict }: Omit<ResolveAlertDialogProps, 'open'>) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corta un segundo clic que llegue antes de que React dibuje el botón deshabilitado.
  const savingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('textarea')?.focus();
  }, []);

  async function resolve() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      onResolved(await resolveConflictAlert(alertId, note.trim() || undefined));
    } catch (failure) {
      const { message } = describeApiError(failure, 'conflict-alert');
      if (failure instanceof ApiError && failure.status === 409) {
        onConflict(message);
        return;
      }
      // El diálogo queda abierto con el error adentro.
      setError(message);
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onClose={onClose}
      // Mientras guarda, Escape no lo cierra: la respuesta tiene que llegar a la lista.
      onCancel={(event) => {
        if (savingRef.current) event.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-borde bg-blanco p-8 text-texto shadow-xl backdrop:bg-texto/50"
    >
      <h2 id={`${id}-title`} className="text-2xl font-bold">
        Marcar la alerta como resuelta
      </h2>
      <p id={`${id}-text`} className="mt-2">
        Hacelo cuando hayas corregido los documentos o decidido que no se contradicen.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={`${id}-nota`} className={LABEL}>
          Nota (opcional)
        </label>
        <textarea
          id={`${id}-nota`}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-describedby={`${id}-contador`}
          disabled={saving}
          className={`${INPUT} resize-y py-3`}
        />
        <p id={`${id}-contador`} className={HINT}>
          {note.length}/{NOTE_MAX}
        </p>
      </div>
      {error && (
        <p role="alert" className={`${ERROR_BOX} mt-4`}>
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className={BUTTON_SECONDARY}
          disabled={saving}
          onClick={() => dialogRef.current?.close()}
        >
          Cancelar
        </button>
        <button type="button" onClick={resolve} disabled={saving} aria-busy={saving} className={BUTTON_PRIMARY}>
          Marcar como resuelta
        </button>
      </div>
    </dialog>
  );
}
