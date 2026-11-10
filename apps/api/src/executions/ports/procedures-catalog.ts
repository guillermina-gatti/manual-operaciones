// Port to the procedures owned by another pair (Mica). Executions only know
// procedures, versions and steps by ID; nothing here maps to their tables.

export interface CatalogStep {
  id: string;
  order: number; // 1..n within the version
  title: string;
  // Optional: what an adapter may give. The instruction of the step, and the key that
  // copies of the step keep across versions (spec 015, R7).
  description?: string;
  stepKey?: string;
}

// One version of a procedure and its steps sorted by order. Versions are immutable:
// the same versionId always has the same steps.
export interface CatalogProcedureVersion {
  procedureId: string;
  versionId: string;
  // The areas CURRENTLY assigned to the procedure, not the ones it had when this
  // version was published. Every version of a procedure reports the same areas, so
  // moving a procedure to another area takes effect on executions in progress too.
  areaIds: string[];
  steps: CatalogStep[];
  // Optional: what an adapter may give. The title of this version of the procedure, its
  // number (1..n within the procedure) and whether it was published as a critical change,
  // with its summary.
  title?: string;
  versionNumber?: number;
  isCritical?: boolean;
  changeSummary?: string | null;
}

// A version published at some point (now PUBLISHED or SUPERSEDED), with what it changed.
export interface CatalogPublication {
  versionId: string;
  versionNumber: number;
  isCritical: boolean;
  changeSummary: string | null;
  publishedAt: Date | null;
}

// The catalog did not answer (timeout, connection). The service turns it into a 503.
export class CatalogUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogUnavailableError';
  }
}

export abstract class ProceduresCatalog {
  // The version currently published for the procedure, or null if the procedure
  // does not exist or has no published version. Used to start an execution.
  // areaIds: the areas currently assigned to the procedure.
  abstract findPublished(
    procedureId: string,
  ): Promise<CatalogProcedureVersion | null>;

  // Any version by ID, published or not. An execution always reads its steps from
  // the version it was started with (CA1).
  // areaIds: the areas currently assigned to the procedure, even for an old version.
  abstract findVersion(
    versionId: string,
  ): Promise<CatalogProcedureVersion | null>;

  // The versions of the same procedure published after versionId (a higher version
  // number, now PUBLISHED or SUPERSEDED; never a draft), the oldest first. An execution
  // uses it to know whether its procedure changed and whether any change was critical
  // (HU33). [] when there are none or the version does not exist.
  abstract findPublishedAfter(versionId: string): Promise<CatalogPublication[]>;
}
