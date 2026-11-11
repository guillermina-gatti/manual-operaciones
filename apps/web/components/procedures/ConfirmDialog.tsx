'use client';

// The confirmation before deleting a step or discarding the draft (spec 015, D25). A native <dialog>
// opened with showModal(): the browser traps the focus, closes it with Escape and makes the rest of
// the page inert. It only exists while it is open: whoever uses it renders it when it has to ask, and
// stops rendering it on onCancel or after onConfirm.
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { BUTTON_SECONDARY } from '@/components/documents/design';

interface ConfirmDialogProps {
  title: string;
  // What happens if the person confirms.
  children: ReactNode;
  onConfirm: () => void;
  // "Cancelar" or Escape.
  onCancel: () => void;
  // The action is running: nothing can be sent twice and Escape does not close it.
  busy?: boolean;
}

const CONFIRM_BUTTON =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-5 font-semibold text-blanco transition-colors hover:bg-peligro/90 disabled:cursor-not-allowed disabled:opacity-60';

export function ConfirmDialog({ title, children, onConfirm, onCancel, busy = false }: ConfirmDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // "Cancelar" has the focus: a hasty Enter does not delete anything.
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onClose={onCancel}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-borde bg-blanco p-0 text-texto shadow-xl backdrop:bg-texto/50"
    >
      <header className="flex items-center gap-3 bg-salvia px-6 py-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rosa-alerta text-lg font-bold text-peligro"
        >
          !
        </span>
        <h2 id={`${id}-title`} className="min-w-0 break-words text-lg font-bold text-bosque">
          {title}
        </h2>
      </header>
      <div className="flex flex-col gap-6 px-6 py-5">
        <p id={`${id}-text`} className="text-texto-suave">
          {children}
        </p>
        <footer className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className={BUTTON_SECONDARY}
            data-initial-focus
            disabled={busy}
            onClick={() => dialogRef.current?.close()}
          >
            Cancelar
          </button>
          <button type="button" className={CONFIRM_BUTTON} disabled={busy} aria-busy={busy} onClick={onConfirm}>
            {busy ? 'Borrando…' : 'Sí, borrar'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
