/* What the area assignment of a procedure needs to know about areas: which exist and which are active (spec 006, R11, P13) */

export interface AreaState {
  id: string;
  isActive: boolean;
}

export abstract class ProcedureAreasCatalog {
  // The state of the areas among `ids` that exist; the ones that do not exist are left out.
  // A database that does not answer is a ProceduresRepositoryUnavailableError.
  abstract findStates(ids: string[]): Promise<AreaState[]>;
}
