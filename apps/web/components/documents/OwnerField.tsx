'use client';

// Elección del responsable (F11). Solo se ofrecen quienes pueden ver el documento: comparten un área
// con las elegidas o son ADMIN (la misma regla que la API, R5). Si al cambiar las áreas el elegido
// deja de serlo, la elección se borra y se pide elegir de nuevo (E4).
// Spec 008 (F4, F6; PD9, PD10): al cambiar las áreas de un documento, el responsable actual siempre
// está en la lista y no se borra, aunque esté inactivo o ya no sea candidato: si perdió el acceso,
// lo dice la API (R6). Las áreas que llegan acá son solo las activas, porque el endpoint de
// candidatos rechaza las inactivas.
import { useEffect, useEffectEvent, useId } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { useApiResource } from '@/lib/api';
import type { DocumentReference } from '@/lib/api';
import { usersDirectory } from '@/lib/directory';
import { formatPerson } from '@/lib/documents/format';
import { BUTTON_SECONDARY, ERROR_TEXT, HINT, INPUT, LABEL } from './design';
import type { Role } from '@/lib/session';

export const OWNER_NO_LONGER_VALID =
  'El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro';

export const NO_ACTIVE_AREAS =
  'Para elegir otro responsable, marcá al menos un área activa';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
};

interface OwnerFieldProps {
  // Las áreas activas elegidas: con ellas se piden los candidatos.
  areaIds: string[];
  value: string;
  error?: string;
  // Como FileField: el responsable y, si hay, el aviso o error que va con él.
  onChange: (ownerId: string, error: string | undefined) => void;
  // Spec 008: el responsable actual, solo al cambiar las áreas de un documento existente.
  currentOwner?: DocumentReference;
  // Spec 008 (F6): hay áreas elegidas, pero ninguna activa.
  onlyInactiveAreas?: boolean;
  // Opcional: el nombre del responsable elegido (null si no hay), cuando cambia la elección o llegan
  // los candidatos. Lo usa la vista previa de la carga; onChange sigue avisando solo el id.
  onOwnerName?: (name: string | null) => void;
}

export function OwnerField({
  areaIds,
  value,
  error,
  onChange,
  currentOwner,
  onlyInactiveAreas = false,
  onOwnerName,
}: OwnerFieldProps) {
  const id = useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;

  // Sin áreas no se pide nada (D5). Una respuesta vieja nunca pisa a la nueva (useApiResource).
  const candidates = useApiResource(
    areaIds.length > 0 ? `owner-candidates:${areaIds.join(',')}` : null,
    () => usersDirectory.listOwnerCandidates(areaIds),
  );

  const notifyChange = useEffectEvent(onChange);

  // Revisa la elección cuando llegan los candidatos de las áreas nuevas. Mientras cargan, o mientras no
  // hay áreas (por ejemplo, al desmarcar Ventas antes de marcar Operaciones), no toca nada: así el orden
  // de los clics no importa y el aviso de E4 aparece cuando corresponde.
  // Spec 008 (PD9): el responsable actual nunca se borra; un candidato que eligió el ADMIN, sí.
  const currentOwnerId = currentOwner?.id;
  useEffect(() => {
    if (!value || value === currentOwnerId) return;
    if (candidates.status === 'success' && !candidates.data.some((user) => user.id === value)) {
      notifyChange('', OWNER_NO_LONGER_VALID);
    }
  }, [value, currentOwnerId, candidates.status, candidates.data]);

  let hint: string | null = null;
  if (areaIds.length === 0) hint = onlyInactiveAreas ? NO_ACTIVE_AREAS : 'Elegí primero las áreas';
  else if (candidates.status === 'loading') hint = 'Cargando responsables…';

  const options = candidates.status === 'success' ? candidates.data : [];
  // El responsable actual va primero si no está entre los candidatos (inactivo o sin acceso), con
  // "(inactivo)" si corresponde (F2).
  const showCurrentOwner =
    currentOwner !== undefined && !options.some((user) => user.id === currentOwner.id);

  // El nombre del elegido, para quien lo pida (onOwnerName). Sin elección, o mientras no llegan los
  // candidatos, null.
  const selectedName =
    options.find((user) => user.id === value)?.name ??
    (currentOwner && currentOwner.id === value ? formatPerson(currentOwner) : null);
  const notifyOwnerName = useEffectEvent((name: string | null) => onOwnerName?.(name));
  useEffect(() => {
    notifyOwnerName(selectedName);
  }, [selectedName]);
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        Responsable
      </label>
      <select
        id={id}
        value={value}
        disabled={candidates.status !== 'success'}
        onChange={(event) => onChange(event.target.value, undefined)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={INPUT}
      >
        <option value="">Elegí un responsable</option>
        {showCurrentOwner && <option value={currentOwner.id}>{formatPerson(currentOwner)}</option>}
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({ROLE_LABELS[user.role]})
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className={HINT}>
          {hint}
        </p>
      )}
      {candidates.status === 'error' && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className={ERROR_TEXT}>
            No pudimos cargar la lista de responsables.
          </p>
          <button type="button" className={BUTTON_SECONDARY} onClick={candidates.reload}>
            Reintentar
          </button>
        </div>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
