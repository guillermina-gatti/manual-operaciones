'use client';

// The button to discard the draft (HU09, R10) and its confirmation. The screen that owns it does the
// discard: onDiscard says whether the draft is gone; if not, the confirmation closes.
import { useLayoutEffect, useState } from 'react';
import { BUTTON_DANGER, BUTTON_SECONDARY } from './design';

interface DiscardDraftProps {
  busy: 'save' | 'discard' | null;
  // The person asked to discard: the screen clears its messages.
  onStart: () => void;
  onDiscard: () => Promise<boolean>;
}

export function DiscardDraft({ busy, onStart, onDiscard }: DiscardDraftProps) {
  const [confirming, setConfirming] = useState(false);

  // Coming back to a hidden screen starts without the confirmation open.
  useLayoutEffect(() => () => setConfirming(false), []);

  async function confirm() {
    if (!(await onDiscard())) setConfirming(false);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className={BUTTON_DANGER}
        disabled={busy !== null}
        onClick={() => {
          onStart();
          setConfirming(true);
        }}
      >
        Descartar borrador
      </button>
    );
  }

  return (
    <fieldset aria-label="Confirmar" className="flex min-w-0 flex-wrap gap-3">
      <p className="basis-full font-semibold">
        ¿Descartar el borrador? Se borra el borrador con sus pasos; si es la única versión, se borra el
        procedimiento con sus áreas.
      </p>
      <button
        type="button"
        className={BUTTON_DANGER}
        onClick={confirm}
        disabled={busy !== null}
        aria-busy={busy === 'discard'}
      >
        {busy === 'discard' ? 'Descartando…' : 'Sí, descartar'}
      </button>
      <button
        type="button"
        className={BUTTON_SECONDARY}
        onClick={() => setConfirming(false)}
        disabled={busy !== null}
      >
        Cancelar
      </button>
    </fieldset>
  );
}
