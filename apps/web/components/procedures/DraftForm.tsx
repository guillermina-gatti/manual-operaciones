'use client';

// The title and description of the draft (HU09, R5), and the button to discard it (R10). Only what
// changed is sent. Every answer of the API updates the local copy through onChange.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { describeProcedureError, discardDraft, updateVersion } from '@/lib/procedures';
import type { UpdateVersionValues } from '@/lib/procedures';
import type { StoredProcedure } from '@/lib/procedures/session-list';
import { withDraft } from '@/lib/procedures/snapshot';
import { validateProcedure } from '@/lib/procedures/validate';
import type { FormErrors } from '@/lib/procedures/validate';

interface DraftFormProps {
  procedure: StoredProcedure;
  // The new copy of the procedure after the API accepted a change.
  onChange: (next: StoredProcedure) => void;
  // The draft is gone (discarded, or the API does not know it): leave the screen.
  onGone: () => void;
}

interface Failure {
  message: string;
  notFound: boolean;
}

const FIELD =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-[invalid=true]:border-red-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

export function DraftForm({ procedure, onChange, onGone }: DraftFormProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const [title, setTitle] = useState(procedure.title);
  const [description, setDescription] = useState(procedure.description ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Stops a second click that arrives before React renders the disabled buttons.
  const busyRef = useRef(false);
  // Changes each time the screen is hidden, so a late answer from before is ignored.
  const visitRef = useRef(0);

  // With cacheComponents, Next hides this page with <Activity> when navigating away and shows the
  // same instance on return. The cleanup runs on hide: coming back starts without old messages.
  useLayoutEffect(
    () => () => {
      visitRef.current += 1;
      busyRef.current = false;
      setBusy(null);
      setNotice(null);
      setFailure(null);
      setConfirming(false);
    },
    [],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    setNotice(null);
    setFailure(null);

    const found = validateProcedure({ title, description });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // The API asks for at least one field (R5): only what changed is sent.
    const changes: UpdateVersionValues = {};
    if (title.trim() !== procedure.title) changes.title = title.trim();
    if (description.trim() !== (procedure.description ?? '')) {
      changes.description = description.trim();
    }
    if (Object.keys(changes).length === 0) {
      setNotice('No hay cambios para guardar.');
      return;
    }

    busyRef.current = true;
    const visit = visitRef.current;
    setBusy('save');
    try {
      const updated = await updateVersion(procedure.id, procedure.versionId, changes);
      onChange(withDraft(procedure, updated));
      if (visitRef.current !== visit) return;
      setTitle(updated.title);
      setDescription(updated.description ?? '');
      setNotice('Cambios guardados.');
    } catch (error) {
      if (visitRef.current !== visit) return;
      setFailure(describeProcedureError(error, 'draft'));
    } finally {
      // After leaving, the hide cleanup already reset these, and a new action may be running.
      if (visitRef.current === visit) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  async function discard() {
    if (busyRef.current) return;
    busyRef.current = true;
    const visit = visitRef.current;
    setBusy('discard');
    setNotice(null);
    setFailure(null);
    try {
      await discardDraft(procedure.id, procedure.versionId);
      onGone();
    } catch (error) {
      if (visitRef.current !== visit) return;
      setFailure(describeProcedureError(error, 'discard'));
      setConfirming(false);
    } finally {
      if (visitRef.current === visit) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
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
            aria-describedby={errors.title ? `${titleId}-error` : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
            }}
          />
          <FieldError id={`${titleId}-error`} message={errors.title} />
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
            aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
            onChange={(event) => {
              setDescription(event.target.value);
              if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
            }}
          />
          <FieldError id={`${descriptionId}-error`} message={errors.description} />
        </div>

        <Button type="submit" className="self-start" disabled={busy !== null} aria-busy={busy === 'save'}>
          {busy === 'save' ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900 shadow-sm dark:border-green-900 dark:bg-green-950/60 dark:text-green-100"
        >
          {notice}
        </p>
      )}

      {failure && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p>{failure.message}</p>
          {failure.notFound && (
            <Button variant="secondary" onClick={onGone}>
              Quitar de la lista
            </Button>
          )}
        </div>
      )}

      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-700">
        {confirming ? (
          <div role="group" aria-label="Confirmar" className="flex flex-col gap-3">
            <p>
              ¿Descartar el borrador? Se borra el borrador con sus pasos; si es la única versión,
              se borra el procedimiento con sus áreas.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={discard} disabled={busy !== null} aria-busy={busy === 'discard'}>
                {busy === 'discard' ? 'Descartando…' : 'Sí, descartar'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy !== null}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => {
              setNotice(null);
              setFailure(null);
              setConfirming(true);
            }}
          >
            Descartar borrador
          </Button>
        )}
      </div>
    </div>
  );
}
