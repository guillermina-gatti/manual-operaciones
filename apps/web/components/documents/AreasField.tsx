'use client';

// Casillas de las áreas del formulario de carga (F2: al menos un área). Las áreas las pide el formulario.
import { useId } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import type { Area } from '@/lib/directory';

interface AreasFieldProps {
  areas: Area[];
  selected: string[];
  onChange: (areaIds: string[]) => void;
  error?: string;
}

export function AreasField({ areas, selected, onChange, error }: AreasFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  // La lista nueva siempre en el orden de las áreas, no en el orden en que se marcaron.
  function toggle(areaId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(areaId);
    else next.delete(areaId);
    onChange(areas.filter((area) => next.has(area.id)).map((area) => area.id));
  }

  return (
    <fieldset
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-1"
    >
      <legend className="font-medium">Áreas</legend>
      {areas.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No hay áreas cargadas</p>
      ) : (
        <div className="flex flex-wrap gap-x-6">
          {areas.map((area) => (
            <label key={area.id} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={selected.includes(area.id)}
                onChange={(event) => toggle(area.id, event.target.checked)}
              />
              {area.name}
            </label>
          ))}
        </div>
      )}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
