'use client';

// Formulario de carga de un documento (F2, F4, F5, F13, F14; plan 002, secciones 1 y 5).
// Estado controlado y onSubmit, no <form action>: React 19 vacía los campos después de una acción
// y se perdería el archivo elegido (F4).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeApiError, uploadDocument, useApiResource } from '@/lib/api';
import type { UploadField } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';
import { DESCRIPTION_MAX } from '@/lib/documents/upload-rules';
import { validateUpload } from '@/lib/documents/validate-upload';
import type { UploadErrors, UploadFormValues } from '@/lib/documents/validate-upload';
import { AreasField } from './AreasField';
import { FileField } from './FileField';
import { FormErrorBanner } from './FormErrorBanner';
import { OwnerField } from './OwnerField';

const EMPTY: UploadFormValues = {
  file: null,
  title: '',
  description: '',
  areaIds: [],
  ownerId: '',
  reviewDate: '',
};

const INPUT =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 aria-[invalid=true]:border-red-600 dark:border-zinc-600 dark:bg-zinc-900';

export function UploadDocumentForm() {
  const router = useRouter();
  // Cambiar la key vuelve a crear el formulario vacío, incluido el <input type="file">,
  // que guarda el archivo por su cuenta (D4: después de una carga correcta, empieza vacío).
  const [formKey, setFormKey] = useState(0);
  const areas = useApiResource('upload-areas', () => areasDirectory.listAreas());

  if (areas.status === 'loading' || areas.status === 'idle') {
    return <ScreenState kind="loading" label="Cargando el formulario…" />;
  }
  if (areas.status === 'error') {
    return (
      <ScreenState kind="error" message="No pudimos cargar las áreas." onRetry={areas.reload} />
    );
  }

  return (
    <UploadForm
      key={formKey}
      areas={areas.data}
      onUploaded={(id) => {
        setFormKey((key) => key + 1);
        // F13: después de cargar, al detalle del documento creado.
        router.push(`/documentos/${id}`);
      }}
    />
  );
}

// Pone o saca el error de un campo.
function withError(errors: UploadErrors, field: UploadField, message: string | undefined) {
  const next = { ...errors };
  if (message) next[field] = message;
  else delete next[field];
  return next;
}

function UploadForm({ areas, onUploaded }: { areas: Area[]; onUploaded: (id: string) => void }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<UploadFormValues>(EMPTY);
  const [errors, setErrors] = useState<UploadErrors>({});
  // Después del primer intento de envío, cada campo se vuelve a validar al cambiar (plan 5.3).
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{
    message: string;
    existingDocumentId?: string;
  } | null>(null);
  // Corta un segundo envío que llegue antes de que React dibuje el botón deshabilitado (F5).
  const submittingRef = useRef(false);
  const [focusRequest, setFocusRequest] = useState(0);
  // Mínimo del <input type="date">: mañana en Buenos Aires (F2, D1 del plan 001).
  const [minReviewDate] = useState(() => tomorrowIn(COMPANY_TIME_ZONE, new Date()));

  // Después de un envío con errores, el foco va al primer campo marcado.
  useEffect(() => {
    if (focusRequest === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target = invalid instanceof HTMLFieldSetElement ? invalid.querySelector('input') : invalid;
    target?.focus();
  }, [focusRequest]);

  function update<K extends keyof UploadFormValues>(field: K, value: UploadFormValues[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (attempted) setErrors((prev) => withError(prev, field, validateUpload(next)[field]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const found = validateUpload(values);
    setAttempted(true);
    setErrors(found);
    // F2: con un error evidente no se sube nada.
    if (Object.keys(found).length > 0) {
      setFocusRequest((n) => n + 1);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const document = await uploadDocument({ ...values, file: values.file! });
      onUploaded(document.id);
    } catch (error) {
      // F4: no se toca ningún valor ni se vuelve a crear el formulario, así el <input type="file">
      // conserva el archivo. Solo se agregan los errores (F3).
      const { message, fieldErrors, existingDocumentId } = describeApiError(error, 'upload');
      setSubmitError({ message, existingDocumentId });
      if (Object.keys(fieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        setFocusRequest((n) => n + 1);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const field = (name: string) => `${id}-${name}`;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <FileField
        file={values.file}
        error={errors.file}
        onChange={(file, error) => {
          setValues((prev) => ({ ...prev, file }));
          setErrors((prev) => withError(prev, 'file', error));
        }}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={field('title')} className="font-medium">
          Título
        </label>
        <input
          id={field('title')}
          className={INPUT}
          value={values.title}
          onChange={(event) => update('title', event.target.value)}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? field('title-error') : undefined}
        />
        <FieldError id={field('title-error')} message={errors.title} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={field('description')} className="font-medium">
          Descripción (opcional)
        </label>
        <textarea
          id={field('description')}
          rows={3}
          className={`${INPUT} py-2`}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={[field('description-count'), errors.description && field('description-error')]
            .filter(Boolean)
            .join(' ')}
        />
        <p id={field('description-count')} className="text-sm text-zinc-600 dark:text-zinc-400">
          {values.description.length}/{DESCRIPTION_MAX}
        </p>
        <FieldError id={field('description-error')} message={errors.description} />
      </div>

      <AreasField
        areas={areas}
        selected={values.areaIds}
        error={errors.areaIds}
        onChange={(areaIds) => update('areaIds', areaIds)}
      />

      <OwnerField
        areaIds={values.areaIds}
        value={values.ownerId}
        error={errors.ownerId}
        onChange={(ownerId, notice) => {
          const next = { ...values, ownerId };
          setValues(next);
          // El aviso de E4 tiene prioridad; si no hay, el error de validación (después del primer intento).
          const message = notice ?? (attempted ? validateUpload(next).ownerId : undefined);
          setErrors((prev) => withError(prev, 'ownerId', message));
        }}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={field('review-date')} className="font-medium">
          Fecha de revisión
        </label>
        <input
          id={field('review-date')}
          type="date"
          min={minReviewDate}
          className={`${INPUT} sm:max-w-xs`}
          value={values.reviewDate}
          onChange={(event) => update('reviewDate', event.target.value)}
          aria-invalid={errors.reviewDate ? true : undefined}
          aria-describedby={errors.reviewDate ? field('review-date-error') : undefined}
        />
        <FieldError id={field('review-date-error')} message={errors.reviewDate} />
      </div>

      {submitError && (
        <FormErrorBanner
          message={submitError.message}
          existingDocumentId={submitError.existingDocumentId}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Cargando…' : 'Cargar documento'}
        </Button>
        {/* F14: salir no pide confirmación. */}
        <Link
          href="/documentos"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
