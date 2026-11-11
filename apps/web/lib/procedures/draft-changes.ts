// What the "Guardar cambios" of the draft has to send (spec 015, D22): the version only gets what
// changed (R5: the API asks for at least one field), and the areas are sent only if the set changed.
import type { UpdateVersionValues } from '@/lib/api/procedures';
import type { EditableProcedure } from './editable';

export interface DraftValues {
  title: string;
  description: string;
  areaIds: string[];
}

// The same areas, whatever the order.
export const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export function draftChanges(procedure: EditableProcedure, values: DraftValues) {
  const version: UpdateVersionValues = {};
  if (values.title.trim() !== procedure.title) version.title = values.title.trim();
  if (values.description.trim() !== (procedure.description ?? '')) {
    version.description = values.description.trim();
  }
  return {
    version,
    hasVersion: Object.keys(version).length > 0,
    areas: !sameIds(values.areaIds, procedure.areaIds),
  };
}
