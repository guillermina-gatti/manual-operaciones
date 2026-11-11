/* Whether the procedure changed while an execution runs on an older version (HU33). Pure */
import type {
  CatalogProcedureVersion,
  CatalogPublication,
} from './ports/procedures-catalog';

// A version published after the one of the execution, as the notice tells it.
export interface PublishedChange {
  versionNumber: number;
  isCritical: boolean;
  changeSummary: string | null;
  publishedAt: Date | null;
}

export interface VersionChange {
  // A version newer than the one of the execution is the current one.
  changed: boolean;
  // Any of the versions published since then is a critical change: the execution has to
  // restart on the current one.
  critical: boolean;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  // The versions published since the one of the execution, up to the current one, the
  // oldest first.
  changes: PublishedChange[];
}

export const NO_CHANGE: VersionChange = {
  changed: false,
  critical: false,
  currentVersionId: null,
  currentVersionNumber: null,
  changes: [],
};

// A fresh copy of NO_CHANGE: callers may change what they get.
export const noVersionChange = (): VersionChange => ({
  ...NO_CHANGE,
  changes: [],
});

// `current` is the published version now (null if there is none); `publishedAfter`, the
// versions published after the one of the execution. Without a published version there is
// nothing to change to. A version published after the current one cannot exist, but if the
// catalog said so it would not count.
export function versionChangeOf(
  executionVersionId: string,
  current: CatalogProcedureVersion | null,
  publishedAfter: CatalogPublication[],
): VersionChange {
  if (!current || current.versionId === executionVersionId) {
    return noVersionChange();
  }

  const upTo = current.versionNumber;
  const changes = publishedAfter
    .filter((v) => upTo === undefined || v.versionNumber <= upTo)
    .sort((a, b) => a.versionNumber - b.versionNumber)
    .map((v): PublishedChange => ({
      versionNumber: v.versionNumber,
      isCritical: v.isCritical,
      changeSummary: v.changeSummary,
      publishedAt: v.publishedAt,
    }));

  return {
    changed: true,
    critical: changes.some((v) => v.isCritical),
    currentVersionId: current.versionId,
    currentVersionNumber: current.versionNumber ?? null,
    changes,
  };
}
