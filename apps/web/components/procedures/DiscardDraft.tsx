'use client';

// The red trash button that discards the draft (HU09, R10; spec 015, D22 and D25) and its dialog. The
// screen that owns it does the discard: onDiscard says whether the draft is gone; if not, the dialog
// closes.
import { useLayoutEffect, useState } from 'react';
import { LIST_BUTTON_DANGER } from '@/components/documents/list-design';
import { ConfirmDialog } from './ConfirmDialog';
import { IconTrash } from './design';

interface DiscardDraftProps {
  busy: 'save' | 'discard' | null;
  // The person asked to discard: the screen clears its messages.
  onStart: () => void;
  onDiscard: () => Promise<boolean>;
}

export function DiscardDraft({ busy, onStart, onDiscard }: DiscardDraftProps) {
  const [confirming, setConfirming] = useState(false);

  // Coming back to a hidden screen starts without the dialog open.
  useLayoutEffect(() => () => setConfirming(false), []);

  async function confirm() {
    if (!(await onDiscard())) setConfirming(false);
  }

  return (
    <>
      <button
        type="button"
        className={`${LIST_BUTTON_DANGER} size-12 px-0!`}
        aria-label="Descartar borrador"
        disabled={busy !== null}
        onClick={() => {
          onStart();
          setConfirming(true);
        }}
      >
        <IconTrash />
      </button>
      {confirming && (
        <ConfirmDialog
          title="¿Descartar el borrador?"
          busy={busy === 'discard'}
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        >
          Se borra el borrador con sus pasos; si es la única versión, se borra el procedimiento con sus
          áreas. No se puede deshacer.
        </ConfirmDialog>
      )}
    </>
  );
}
