'use client';

// Panel para cambiar las áreas de un documento (spec 003, R3 a R5, P2; plan 003, 6.2).
// Reutiliza AreasField y OwnerField de la carga: si con las áreas nuevas el responsable deja de ser
// válido, OwnerField lo borra y pide elegir otro en la misma operación. Como la carga, usa estado
// controlado: ante un error no se pierde nada de lo elegido (F4 del plan 002).
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { changeAreas, describeApiError, useApiResource } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { AreasField } from './AreasField';
import { FormErrorBanner } from './FormErrorBanner';
import { OwnerField } from './OwnerField';

interface ChangeAreasFormProps {
  document: DocumentResponse;
  // Con el documento actualizado, después de un cambio correcto.
  onDone: (document: DocumentResponse) => void;
  onCancel?: () => void;
}

type Field = 'areaIds' | 'ownerId';
type Errors = Partial<Record<Field, string>>;

// Los mismos textos que validateUpload (plan 002, 5.3).
function validate(areaIds: string[], ownerId: string): Errors {
  const errors: Errors = {};
  if (areaIds.length === 0) errors.areaIds = 'Elegí al menos un área.';
  if (ownerId === '') errors.ownerId = 'Elegí un responsable.';
  return errors;
}

function withError(errors: Errors, field: Field, message: string | undefined): Errors {
  const next = { ...errors };
  if (message) next[field] = message;
  else delete next[field];
  return next;
}

export function ChangeAreasForm(props: ChangeAreasFormProps) {
  const areas = useApiResource('lifecycle-areas', () => areasDirectory.listAreas());

  if (areas.status === 'loading' || areas.status === 'idle') {
    return <ScreenState kind="loading" label="Cargando las áreas…" />;
  }
  if (areas.status === 'error') {
    return (
      <ScreenState kind="error" message="No pudimos cargar las áreas." onRetry={areas.reload} />
    );
  }
  return <AreasForm {...props} areas={areas.data} />;
}

function AreasForm({
  document,
  onDone,
  onCancel,
  areas,
}: ChangeAreasFormProps & { areas: Area[] }) {
  const [areaIds, setAreaIds] = useState(document.areaIds);
  const [ownerId, setOwnerId] = useState(document.ownerId);
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Corta un segundo envío que llegue antes de que React dibuje el botón deshabilitado (F5).
  const submittingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const found = validate(areaIds, ownerId);
    setAttempted(true);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // ownerId solo si el ADMIN eligió otro responsable (plan 003, 6.2).
      const updated = await changeAreas(
        document.id,
        ownerId === document.ownerId ? { areaIds } : { areaIds, ownerId },
      );
      onDone(updated);
    } catch (error) {
      const { message, fieldErrors } = describeApiError(error, 'areas');
      setSubmitError(message);
      setErrors((prev) => ({
        ...prev,
        ...(fieldErrors.areaIds && { areaIds: fieldErrors.areaIds }),
        ...(fieldErrors.ownerId && { ownerId: fieldErrors.ownerId }),
      }));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <AreasField
        areas={areas}
        selected={areaIds}
        error={errors.areaIds}
        onChange={(next) => {
          setAreaIds(next);
          if (attempted) setErrors((prev) => withError(prev, 'areaIds', validate(next, ownerId).areaIds));
        }}
      />

      <OwnerField
        areaIds={areaIds}
        value={ownerId}
        error={errors.ownerId}
        onChange={(next, notice) => {
          setOwnerId(next);
          // El aviso de R4 ("…Elegí otro") tiene prioridad; si no hay, la validación.
          const message = notice ?? (attempted ? validate(areaIds, next).ownerId : undefined);
          setErrors((prev) => withError(prev, 'ownerId', message));
        }}
      />

      {submitError && <FormErrorBanner message={submitError} />}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Guardando…' : 'Guardar áreas'}
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
