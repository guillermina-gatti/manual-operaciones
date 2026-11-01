'use client';

// "Marcar como revisado" (spec 005, F4, F5; plan 005, 7.5): la próxima fecha de revisión, desde
// mañana en Buenos Aires (R7), y el botón. Ante un error no se pierde la fecha elegida.
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { describeApiError, markReviewed } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { validateReviewDate } from '@/lib/documents/validate-upload';
import { FormErrorBanner } from './FormErrorBanner';
import { ReviewDateField } from './ReviewDateField';

interface MarkReviewedFormProps {
  documentId: string;
  // Con el documento actualizado (fecha nueva y última revisión).
  onDone: (document: DocumentResponse) => void;
}

// Vacía, el aviso propio de este formulario; si no, la misma regla que la carga (R7).
const validate = (reviewDate: string) =>
  reviewDate === '' ? 'Elegí la próxima fecha de revisión.' : validateReviewDate(reviewDate);

export function MarkReviewedForm({ documentId, onDone }: MarkReviewedFormProps) {
  const [reviewDate, setReviewDate] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Corta un segundo envío que llegue antes de que React dibuje el botón deshabilitado (F5 del plan 002).
  const submittingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const found = validate(reviewDate);
    setAttempted(true);
    setError(found);
    if (found) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      onDone(await markReviewed(documentId, reviewDate));
    } catch (caught) {
      // La fecha elegida no se toca (F5).
      const { message, fieldErrors } = describeApiError(caught, 'review');
      setSubmitError(message);
      if (fieldErrors.reviewDate) setError(fieldErrors.reviewDate);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {/* F6: en el celular, el campo y el botón uno debajo del otro; desde sm:, en fila. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <ReviewDateField
          label="Próxima fecha de revisión"
          value={reviewDate}
          error={error}
          onChange={(next) => {
            setReviewDate(next);
            if (attempted) setError(validate(next));
          }}
        />
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Guardando…' : 'Marcar como revisado'}
        </Button>
      </div>

      {submitError && <FormErrorBanner message={submitError} />}
    </form>
  );
}
