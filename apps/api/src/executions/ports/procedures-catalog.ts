// Port to the procedures owned by another pair (Mica). Executions only know
// procedures, versions and steps by ID; nothing here maps to their tables.

export interface CatalogStep {
  id: string;
  order: number; // 1..n within the version
  title: string;
}

// One version of a procedure, with the areas that can execute it and its steps
// sorted by order.
export interface CatalogProcedureVersion {
  procedureId: string;
  versionId: string;
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
  abstract findPublished(
    procedureId: string,
  ): Promise<CatalogProcedureVersion | null>;

  // Any version by ID, published or not. An execution always reads its steps from
  // the version it was started with (CA1).
  abstract findVersion(
    versionId: string,
  ): Promise<CatalogProcedureVersion | null>;
}
