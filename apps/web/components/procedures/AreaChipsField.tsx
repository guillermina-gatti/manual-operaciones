'use client';

// The areas of the draft as chips you can mark (spec 015, D22 and D26): the same chip as AreaChips
// (HU11) but selectable, with "(inactiva)" for an inactive area. An inactive area is shown only if the
// procedure already has it, so a new inactive one cannot be chosen (the API says 400 anyway).
// components/documents/ is not changed: the chip classes are imported from there.
import { CHIP, HINT, LABEL } from '@/components/documents/design';
import type { Area } from '@/lib/directory';
import { displayAreaName } from '@/lib/directory/areas-directory';

interface AreaChipsFieldProps {
  areas: Area[];
  selected: string[];
  onChange: (areaIds: string[]) => void;
}

export function AreaChipsField({ areas, selected, onChange }: AreaChipsFieldProps) {
  const visible = areas.filter((area) => area.isActive !== false || selected.includes(area.id));

  // The new list always follows the order of the areas, not the order in which they were marked.
  function toggle(areaId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(areaId);
    else next.delete(areaId);
    onChange(areas.filter((area) => next.has(area.id)).map((area) => area.id));
  }

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-3">
      <legend className="sr-only">Áreas</legend>
      <span aria-hidden="true" className={LABEL}>
        Áreas
      </span>
      {visible.length === 0 && <span className="text-texto-suave">No hay áreas disponibles</span>}
      {visible.map((area) => (
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
      <p className={`${HINT} basis-full`}>
        Un procedimiento puede quedar sin áreas, pero no se puede publicar sin al menos una.
      </p>
    </fieldset>
  );
}
