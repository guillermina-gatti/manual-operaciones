// How a version of a procedure looks and which one is which (spec 015). Pure functions, no screen.
import type { VersionHistoryItem } from '@/lib/api/procedure-versions';
import type { ProcedureVersionStatus } from '@/lib/api/procedures';

// The state is always said with a word; the color only goes with it (DESIGN.md 2.2).
export const VERSION_LABELS: Record<ProcedureVersionStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
  SUPERSEDED: 'Reemplazada',
};

// The dot of each state: the names are the tones of StatusDot (blue, green, grey).
export const VERSION_TONES = {
  DRAFT: 'azul',
  PUBLISHED: 'exito',
  SUPERSEDED: 'gris',
} as const satisfies Record<ProcedureVersionStatus, 'azul' | 'exito' | 'gris'>;

// "Versión 2 · publicada": the same text in the editor and in the list of procedures.
export const versionSummary = (versionNumber: number, status: ProcedureVersionStatus) =>
  `Versión ${versionNumber} · ${VERSION_LABELS[status].toLowerCase()}`;

// The history comes newest first; this keeps it so whatever the order it arrives in.
export const newestFirst = (versions: readonly VersionHistoryItem[]): VersionHistoryItem[] =>
  [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

// At most one draft and one published version per procedure.
export const findDraft = (versions: readonly VersionHistoryItem[]) =>
  versions.find((version) => version.status === 'DRAFT');

export const hasPublished = (versions: readonly VersionHistoryItem[]) =>
  versions.some((version) => version.status === 'PUBLISHED');
