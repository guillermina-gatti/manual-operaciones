'use client';

// Creating a procedure (HU09, R2): a title and an optional description. The API answers with the
// procedure and its version 1 as a draft; the screens keep it in the list of this session.
import Link from 'next/link';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { createProcedure, describeProcedureError } from '@/lib/procedures';
import { saveProcedure } from '@/lib/procedures/session-list';
import { fromCreated } from '@/lib/procedures/snapshot';
import { validateProcedure } from '@/lib/procedures/validate';
import type { FormErrors } from '@/lib/procedures/validate';
import { useSession } from '@/lib/session';

const FIELD =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-[invalid=true]:border-red-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

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
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="font-medium">
          Título
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          className={FIELD}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? titleErrorId : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
        />
        <FieldError id={titleErrorId} message={errors.title} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionId} className="font-medium">
          Descripción (opcional)
        </label>
        <textarea
          id={descriptionId}
          rows={3}
          value={description}
          className={FIELD}
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
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {submitError}
        </p>
      )}

      {createdId && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900 shadow-sm dark:border-green-900 dark:bg-green-950/60 dark:text-green-100"
        >
          Procedimiento creado.{' '}
          <Link
            href={`/procedimientos/${createdId}`}
            className="font-medium text-blue-700 underline dark:text-blue-300"
          >
            Abrir el borrador
          </Link>
        </p>
      )}

      <Button type="submit" className="self-start" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Creando…' : 'Crear procedimiento'}
      </Button>
    </form>
  );
}
