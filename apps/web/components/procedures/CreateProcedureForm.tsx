'use client';

// Creating a procedure (HU09, R2): a title and an optional description. The API answers with the
// procedure and its version 1 as a draft; the screen then shows that draft in this same place (D21).
import { useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LIST_BUTTON_PRIMARY } from '@/components/documents/list-design';
import { createProcedure, describeProcedureError } from '@/lib/procedures';
import { validateProcedure } from '@/lib/procedures/validate';
import type { FormErrors } from '@/lib/procedures/validate';
import { Notice } from './Notice';
import { TextField } from './TextField';

// onCreated: gets the id of the new procedure, so the screen can show its draft.
export function CreateProcedureForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Stops a second click that arrives before React renders the disabled button.
  const submittingRef = useRef(false);
  // Changes each time the screen is hidden, so a late answer from before is ignored.
  const visitRef = useRef(0);

  // With cacheComponents, Next hides this page with <Activity> when navigating away and shows the
  // same instance on return. The cleanup runs on hide: coming back starts without old messages.
  useLayoutEffect(
    () => () => {
      visitRef.current += 1;
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitError(null);
    },
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const found = validateProcedure({ title, description });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    submittingRef.current = true;
    const visit = visitRef.current;
    setSubmitting(true);
    setSubmitError(null);
    const trimmedDescription = description.trim();
    try {
      const response = await createProcedure({
        title: title.trim(),
        ...(trimmedDescription !== '' && { description: trimmedDescription }),
      });
      // The screen is told even if the user already left: the procedure exists in the API.
      onCreated?.(response.id);
      if (visitRef.current !== visit) return;
      setTitle('');
      setDescription('');
    } catch (failure) {
      if (visitRef.current !== visit) return;
      setSubmitError(describeProcedureError(failure, 'create').message);
    } finally {
      // After leaving, the hide cleanup already reset these, and a new submit may be running.
      if (visitRef.current === visit) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
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

      {submitError && (
        <Notice tone="error" role="alert">
          {submitError}
        </Notice>
      )}

      <button
        type="submit"
        className={`${LIST_BUTTON_PRIMARY} self-start`}
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? 'Creando…' : 'Crear procedimiento'}
      </button>
    </form>
  );
}
