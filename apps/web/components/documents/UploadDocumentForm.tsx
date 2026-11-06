'use client';

// Formulario de carga de un documento (F2, F4, F5, F13, F14; plan 002, secciones 1 y 5).
// Estado controlado y onSubmit, no <form action>: React 19 vacía los campos después de una acción
// y se perdería el archivo elegido (F4).
// En tres secciones (Archivo, Datos, Quién lo cuida), con la vista previa de la tarjeta al lado (debajo
// en el celular). El título se sugiere desde el nombre del archivo, sin pisar lo que se escribió.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeApiError, uploadDocument, useApiResource } from '@/lib/api';
import type { UploadField } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { suggestTitle } from '@/lib/documents/suggest-title';
import { DESCRIPTION_MAX } from '@/lib/documents/upload-rules';
import { validateUpload } from '@/lib/documents/validate-upload';
import type { UploadErrors, UploadFormValues } from '@/lib/documents/validate-upload';
import { AreasField } from './AreasField';
import { FileDropField } from './FileDropField';
import { FormErrorBanner } from './FormErrorBanner';
import { OwnerField } from './OwnerField';
import { ReviewDateShortcuts } from './ReviewDateShortcuts';
import { UploadPreview } from './UploadPreview';
import { HINT, INPUT, LABEL } from './design';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY, LIST_PANEL } from './list-design';

const EMPTY: UploadFormValues = {
  file: null,
  title: '',
  description: '',
  areaIds: [],
  ownerId: '',
  reviewDate: '',
};


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

// Una de las tres secciones: una tarjeta con su título. Sin aria-labelledby a propósito: "Archivo"
// es también la etiqueta del input, y no tiene que nombrar dos cosas.
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${LIST_PANEL} flex min-w-0 flex-col gap-6`}>
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
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
  // La última sugerencia de título que se aplicó: si el título sigue siendo esa, no lo escribió el
  // usuario y se puede reemplazar por la del archivo nuevo.
  const [suggestion, setSuggestion] = useState('');
  // Solo para la vista previa: el nombre del responsable elegido.
  const [ownerName, setOwnerName] = useState<string | null>(null);

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

  // Al elegir (o quitar) un archivo. Si el título está vacío o sigue siendo la sugerencia anterior,
  // pasa a ser la sugerencia del archivo nuevo; si el usuario lo cambió, no se toca.
  function chooseFile(file: File | null, error: string | undefined) {
    const suggested = file ? suggestTitle(file.name) : '';
    const applies = suggested !== '' && (values.title === '' || values.title === suggestion);
    const next = { ...values, file, title: applies ? suggested : values.title };
    setValues(next);
    if (applies) setSuggestion(suggested);
    setErrors((prev) => {
      const withFile = withError(prev, 'file', error);
      // Después del primer intento, el título sugerido también se vuelve a validar.
      return applies && attempted ? withError(withFile, 'title', validateUpload(next).title) : withFile;
    });
  }

  const field = (name: string) => `${id}-${name}`;
  const titleSuggested = values.title !== '' && values.title === suggestion;
  const titleDescribedBy =
    [titleSuggested && field('title-suggested'), errors.title && field('title-error')]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form ref={formRef} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-6">
        <FormSection title="Archivo">
          <FileDropField file={values.file} error={errors.file} onChange={chooseFile} />
        </FormSection>

        <FormSection title="Datos">
          <div className="flex flex-col gap-2">
            <label htmlFor={field('title')} className={LABEL}>
              Título
            </label>
            <input
              id={field('title')}
              className={INPUT}
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={titleDescribedBy}
            />
            {titleSuggested && (
              <p id={field('title-suggested')} className={HINT}>
                Sugerido a partir del nombre del archivo. Podés cambiarlo.
              </p>
            )}
            <FieldError id={field('title-error')} message={errors.title} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={field('description')} className={LABEL}>
              Descripción (opcional)
            </label>
            <textarea
              id={field('description')}
              rows={3}
              className={`${INPUT} py-2`}
              value={values.description}
              onChange={(event) => update('description', event.target.value)}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={[
                field('description-count'),
                errors.description && field('description-error'),
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <p id={field('description-count')} className={HINT}>
              {values.description.length}/{DESCRIPTION_MAX}
            </p>
            <FieldError id={field('description-error')} message={errors.description} />
          </div>
        </FormSection>

        <FormSection title="Quién lo cuida">
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
            onOwnerName={setOwnerName}
          />

          <ReviewDateShortcuts
            value={values.reviewDate}
            error={errors.reviewDate}
            onChange={(reviewDate) => update('reviewDate', reviewDate)}
          />
        </FormSection>

        {submitError && (
          <FormErrorBanner
            message={submitError.message}
            existingDocumentId={submitError.existingDocumentId}
          />
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className={LIST_BUTTON_PRIMARY}
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Cargando…' : 'Cargar documento'}
          </button>
          {/* F14: salir no pide confirmación. */}
          <Link href="/documentos" className={LIST_BUTTON_SECONDARY}>
            Cancelar
          </Link>
        </div>
      </form>

      <UploadPreview
        fileName={values.file?.name ?? null}
        title={values.title}
        areas={areas.filter((area) => values.areaIds.includes(area.id))}
        ownerName={values.ownerId ? ownerName : null}
      />
    </div>
  );
}
