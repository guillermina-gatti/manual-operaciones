'use client';

// Elección del responsable (F11). Solo se ofrecen quienes pueden ver el documento: comparten un área
// con las elegidas o son ADMIN (la misma regla que la API, R5). Si al cambiar las áreas el elegido
// deja de serlo, la elección se borra y se pide elegir de nuevo (E4).
import { useEffect, useEffectEvent, useId } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { useApiResource } from '@/lib/api';
import { usersDirectory } from '@/lib/directory';
import type { Role } from '@/lib/session';

export const OWNER_NO_LONGER_VALID =
  'El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
};

interface OwnerFieldProps {
  areaIds: string[];
  value: string;
  error?: string;
  // Como FileField: el responsable y, si hay, el aviso o error que va con él.
  onChange: (ownerId: string, error: string | undefined) => void;
}

export function OwnerField({ areaIds, value, error, onChange }: OwnerFieldProps) {
  const id = useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;

  // Sin áreas no se pide nada (D5). Una respuesta vieja nunca pisa a la nueva (useApiResource).
  const candidates = useApiResource(
    areaIds.length > 0 ? `owner-candidates:${areaIds.join(',')}` : null,
    () => usersDirectory.listOwnerCandidates(areaIds),
  );

  const notifyChange = useEffectEvent(onChange);

  // Revisa la elección cuando cambian las áreas o llegan los candidatos nuevos. Mientras cargan, no toca nada.
  useEffect(() => {
    if (!value) return;
    if (areaIds.length === 0) {
      notifyChange('', undefined);
      return;
    }
    if (candidates.status === 'success' && !candidates.data.some((user) => user.id === value)) {
      notifyChange('', OWNER_NO_LONGER_VALID);
    }
  }, [value, areaIds.length, candidates.status, candidates.data]);

  let hint: string | null = null;
  if (areaIds.length === 0) hint = 'Elegí primero las áreas';
  else if (candidates.status === 'loading') hint = 'Cargando responsables…';

  const options = candidates.status === 'success' ? candidates.data : [];
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        Responsable
      </label>
      <select
        id={id}
        value={value}
        disabled={candidates.status !== 'success'}
        onChange={(event) => onChange(event.target.value, undefined)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
      >
        <option value="">Elegí un responsable</option>
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({ROLE_LABELS[user.role]})
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className="text-sm text-zinc-600 dark:text-zinc-400">
          {hint}
        </p>
      )}
      {candidates.status === 'error' && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            No pudimos cargar la lista de responsables.
          </p>
          <Button variant="secondary" onClick={candidates.reload}>
            Reintentar
          </Button>
        </div>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
