// Port to the procedures owned by another pair (Mica). Executions only know
// procedures, versions and steps by ID; nothing here maps to their tables.

export interface CatalogStep {
  id: string;
  order: number; // 1..n within the version
  title: string;
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
}
