'use client';

// The title and description of the draft (HU09, R5), and the button to discard it (R10). Only what
// changed is sent. Every answer of the API updates the local copy through onChange. It has no box of
// its own: the section that holds it lays its parts out.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { validateProcedure } from '@/lib/procedures/validate';
import type { FormErrors } from '@/lib/procedures/validate';
import { DiscardDraft } from './DiscardDraft';
import { Notice } from './Notice';
import { TextField } from './TextField';
import { useDraftActions } from './useDraftActions';

interface DraftFormProps {
  procedure: EditableProcedure;
  // The new copy of the procedure after the API accepted a change.
  onChange: (next: EditableProcedure) => void;
  // The draft is gone (discarded, or the API does not know it): leave the screen.
  onGone: () => void;
}

export function DraftForm({ procedure, onChange, onGone }: DraftFormProps) {
  const [title, setTitle] = useState(procedure.title);
  const [description, setDescription] = useState(procedure.description ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const { busy, notice, failure, clearMessages, save, discard } = useDraftActions(
    procedure,
    onChange,
    onGone,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    const found = validateProcedure({ title, description });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const saved = await save({ title, description });
    if (saved) {
      setTitle(saved.title);
      setDescription(saved.description);
    }
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <TextField
          label="Título"
          value={title}
          error={errors.title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
        />
        <TextField
          label="Descripción (opcional)"
          rows={3}
          value={description}
          error={errors.description}
          onChange={(event) => {
            setDescription(event.target.value);
            if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
          }}
        />
        <button
          type="submit"
          className={`${LIST_BUTTON_PRIMARY} self-start`}
          disabled={busy !== null}
          aria-busy={busy === 'save'}
        >
          {busy === 'save' ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {notice && (
        <Notice tone="success" role="status">
          {notice}
        </Notice>
      )}

      {failure && (
        <Notice tone="error" role="alert" className="flex flex-col items-start gap-3">
          <p>{failure.message}</p>
          {failure.notFound && (
            <button type="button" className={LIST_BUTTON_SECONDARY} onClick={onGone}>
              Quitar de la lista
            </button>
          )}
        </Notice>
      )}

      <footer className="border-t border-borde pt-5">
        <DiscardDraft busy={busy} onStart={clearMessages} onDiscard={discard} />
      </footer>
    </>
  );
}
