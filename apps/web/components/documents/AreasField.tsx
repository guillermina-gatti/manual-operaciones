'use client';

// Casillas de las áreas del formulario de carga (F2: al menos un área). Las áreas las pide el formulario.
import { useId } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import type { Area } from '@/lib/directory';
import { displayAreaName } from '@/lib/directory/areas-directory';
import { CHIP, HINT, LABEL } from './design';

interface AreasFieldProps {
  areas: Area[];
  selected: string[];
  onChange: (areaIds: string[]) => void;
  error?: string;
}

export function AreasField({ areas, selected, onChange, error }: AreasFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  // Un área desactivada nunca se puede agregar; si ya está vinculada, se muestra sin borrarla.
  const visibleAreas = areas.filter((area) => area.isActive !== false || selected.includes(area.id));

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
      className="flex min-w-0 flex-col gap-2"
    >
      <legend className={`${LABEL} mb-2`}>Áreas</legend>
      {visibleAreas.length === 0 ? (
        <p className={HINT}>No hay áreas disponibles</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visibleAreas.map((area) => (
            // Casilla con forma de chip: marcada, en el verde de las áreas.
            <label
              key={area.id}
              className={`${CHIP} min-h-11 cursor-pointer gap-2 border border-borde bg-blanco px-3 has-checked:border-chip-area-texto has-checked:bg-chip-area has-checked:text-chip-area-texto`}
            >
              <input
                type="checkbox"
                className="size-5 accent-bosque"
                checked={selected.includes(area.id)}
                onChange={(event) => toggle(area.id, event.target.checked)}
              />
              {displayAreaName(area)}
            </label>
          ))}
        </div>
      )}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
