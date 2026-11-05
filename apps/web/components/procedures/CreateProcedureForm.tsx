'use client';

// Creating a procedure (HU09, R2): a title and an optional description. The API answers with the
// procedure and its version 1 as a draft; the screens keep it in the list of this session.
import Link from 'next/link';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { createProcedure, describeProcedureError } from '@/lib/procedures';
import { saveProcedure } from '@/lib/procedures/session-list';
import { fromCreated } from '@/lib/procedures/snapshot';
import { validateProcedure } from '@/lib/procedures/validate';
import type { FormErrors } from '@/lib/procedures/validate';
import { useSession } from '@/lib/session';
import { ACTION_LINK, BUTTON_PRIMARY, INPUT, LABEL, Notice } from './design';

export function CreateProcedureForm() {
  const { user } = useSession();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const titleErrorId = `${titleId}-error`;
  const descriptionErrorId = `${descriptionId}-error`;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
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
      setCreatedId(null);
    },
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !user) return;

    const found = validateProcedure({ title, description });
    setErrors(found);
    setCreatedId(null);
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
      // It is saved even if the user already left: the procedure exists in the API.
      saveProcedure(user.id, fromCreated(response));
      if (visitRef.current !== visit) return;
      setTitle('');
      setDescription('');
      setCreatedId(response.id);
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
      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className={LABEL}>
          Título
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          className={INPUT}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? titleErrorId : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
        />
        <FieldError id={titleErrorId} message={errors.title} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={descriptionId} className={LABEL}>
          Descripción (opcional)
        </label>
        <textarea
          id={descriptionId}
          rows={3}
          value={description}
          className={INPUT}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? descriptionErrorId : undefined}
          onChange={(event) => {
            setDescription(event.target.value);
            if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
          }}
        />
        <FieldError id={descriptionErrorId} message={errors.description} />
      </div>

      {submitError && (
        <Notice tone="error" role="alert">
          {submitError}
        </Notice>
      )}

      {createdId && (
        <Notice tone="success" role="status">
          Procedimiento creado.{' '}
          <Link href={`/procedimientos/${createdId}`} className={ACTION_LINK}>
            Abrir el borrador
          </Link>
        </Notice>
      )}

      <button
        type="submit"
        className={`${BUTTON_PRIMARY} self-start`}
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? 'Creando…' : 'Crear procedimiento'}
      </button>
    </form>
  );
}
