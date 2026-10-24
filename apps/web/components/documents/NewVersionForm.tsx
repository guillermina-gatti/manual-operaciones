'use client';

// Panel para subir una versión nueva (spec 003, R6 a R9, R7b; plan 003, 6.3). Reutiliza FileField,
// que valida al elegir y conserva el archivo ante un error, y ReviewDateField en modo opcional.
// Cada 409 se explica según su reason (D7).
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { describeApiError, uploadVersion } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { validateFile, validateReviewDate } from '@/lib/documents/validate-upload';
import { FileField } from './FileField';
import { FormErrorBanner } from './FormErrorBanner';
import { ReviewDateField } from './ReviewDateField';

interface NewVersionFormProps {
  document: DocumentResponse;
  // Con el documento actualizado (la versión nueva como vigente).
  onDone: (document: DocumentResponse) => void;
  onCancel?: () => void;
}

type Field = 'file' | 'reviewDate';
type Errors = Partial<Record<Field, string>>;

// La fecha solo se valida si se completó: vacía, el documento conserva la que tiene (R7b).
function validate(file: File | null, reviewDate: string): Errors {
  const errors: Errors = {};
  const fileError = validateFile(file);
  if (fileError) errors.file = fileError;
  const dateError = reviewDate === '' ? undefined : validateReviewDate(reviewDate);
  if (dateError) errors.reviewDate = dateError;
  return errors;
}

export function NewVersionForm({ document, onDone, onCancel }: NewVersionFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [reviewDate, setReviewDate] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{
    message: string;
    existingDocumentId?: string;
  } | null>(null);
  // Corta un segundo envío que llegue antes de que React dibuje el botón deshabilitado (F5).
  const submittingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const found = validate(file, reviewDate);
    setAttempted(true);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      onDone(await uploadVersion(document.id, { file: file!, reviewDate }));
    } catch (error) {
      // No se toca el archivo ni la fecha: el <input type="file"> conserva lo elegido (R9, F4).
      const { message, fieldErrors, existingDocumentId } = describeApiError(error, 'version');
      setSubmitError({ message, existingDocumentId });
      setErrors((prev) => ({
        ...prev,
        ...(fieldErrors.file && { file: fieldErrors.file }),
        ...(fieldErrors.reviewDate && { reviewDate: fieldErrors.reviewDate }),
      }));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <FileField
        file={file}
        error={errors.file}
        onChange={(chosen, error) => {
          setFile(chosen);
          setErrors((prev) => ({ ...prev, file: error }));
        }}
      />

      <ReviewDateField
        optional
        currentDate={document.reviewDate}
        value={reviewDate}
        error={errors.reviewDate}
        onChange={(next) => {
          setReviewDate(next);
          if (attempted) {
            setErrors((prev) => ({ ...prev, reviewDate: validate(file, next).reviewDate }));
          }
        }}
      />

      {submitError && (
        <FormErrorBanner
          message={submitError.message}
          existingDocumentId={submitError.existingDocumentId}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Cargando…' : 'Subir versión'}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
