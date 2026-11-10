// How the comparison of two versions is told (spec 015, R10). Pure functions, no screen.
import type { ChangedField, ModifiedStep, VersionComparison } from '@/lib/api/procedure-versions';

const FIELD_TEXT: Record<ChangedField, string> = {
  title: 'el título',
  description: 'la descripción',
  order: 'de lugar',
};

export const hasDifferences = (comparison: VersionComparison): boolean =>
  comparison.added.length + comparison.removed.length + comparison.modified.length > 0;

// "Cambió el título y la descripción"; a step that moved says from which place to which.
export function describeChange({ before, after, changedFields }: ModifiedStep): string {
  const parts = changedFields.map((field) => FIELD_TEXT[field]);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts.join('');
  const place = changedFields.includes('order')
    ? `: de la posición ${before.order} a la ${after.order}`
    : '';
  return `Cambió ${list}${place}`;
}
