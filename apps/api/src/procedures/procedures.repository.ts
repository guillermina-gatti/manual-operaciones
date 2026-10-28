/* How the procedures use cases read and write procedures and drafts, without depending on Prisma */
import type { ProcedureVersionStatus } from '../generated/prisma/client';

// The database did not answer (timeout, connection). The service turns it into a 503.
export class ProceduresRepositoryUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProceduresRepositoryUnavailableError';
  }
}

// The procedure already has a draft (R3): found under the lock, or rejected by the database
// (index procedure_versions_one_draft_idx).
export class DraftAlreadyExistsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DraftAlreadyExistsError';
  }
}

// The procedure has no PUBLISHED version to copy into a new draft (R4).
export class NoPublishedVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoPublishedVersionError';
  }
}

export interface VersionRecord {
  id: string;
  procedureId: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  title: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  stepCount: number;
}

// A procedure with its current areas and its versions by ascending number. It has what the access
// policy needs (areaIds, and the number, status and stepCount of each version).
export interface ProcedureRecord {
  id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  areaIds: string[];
  versions: VersionRecord[];
}

// A new procedure is created with its version 1 as a DRAFT; the owner is who creates it (R2).
export interface NewProcedure {
  id: string;
  versionId: string;
  ownerId: string;
  title: string;
  description: string | null;
}

export interface NewDraft {
  procedureId: string;
  versionId: string;
  createdById: string;
}

// Only the fields that are present change (R5).
export interface DraftChanges {
  title?: string;
  description?: string;
}

// Why an operation on a draft was not applied. The service answers 404 and 409.
export type DraftRejection = 'NOT_FOUND' | 'NOT_A_DRAFT';

export type DraftResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: DraftRejection };

export interface StepRecord {
  id: string;
  procedureVersionId: string;
  order: number;
  title: string;
  description: string;
}

// A step to add. position (1 to n + 1) is optional: at the end when it is missing (R7).
export interface NewStep {
  id: string;
  title: string;
  description: string;
  position?: number;
}

// Only the fields that are present change (R6).
export interface StepChanges {
  title?: string;
  description?: string;
}

// Why an operation on a step was not applied, besides the ones of a draft. The service answers
// 404, 409 or 400.
export type StepRejection =
  | DraftRejection
  | 'STEP_NOT_FOUND'
  | 'STEP_LIMIT_REACHED'
  | 'INVALID_POSITION'
  | 'INVALID_ORDER';

export type StepResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: StepRejection };

export abstract class ProceduresRepository {
  // Inserts the procedure and its version 1 as a DRAFT in one statement.
  abstract create(data: NewProcedure): Promise<ProcedureRecord>;

  // The procedure with its areas and versions, or null.
  abstract findById(id: string): Promise<ProcedureRecord | null>;

  // Creates the next version as a DRAFT, copying title, description and steps (with new ids) from the
  // current PUBLISHED one. The procedure row is locked, so two requests run one after the other.
  // null if the procedure does not exist. Throws DraftAlreadyExistsError or NoPublishedVersionError.
  abstract createDraft(data: NewDraft): Promise<VersionRecord | null>;

  // Changes the draft. NOT_FOUND if the version is not in that procedure; NOT_A_DRAFT if it is
  // PUBLISHED or SUPERSEDED (R9). The version row is locked while it changes.
  abstract updateDraft(
    procedureId: string,
    versionId: string,
    changes: DraftChanges,
  ): Promise<DraftResult<VersionRecord>>;

  // Deletes the draft with its steps and, if it was the only version, the procedure with its areas (R10).
  abstract deleteDraft(
    procedureId: string,
    versionId: string,
  ): Promise<DraftResult<{ procedureDeleted: boolean }>>;

  // Adds a step to a draft, at the end or at step.position, and renumbers the others (R7). Rejected
  // with STEP_LIMIT_REACHED if the draft already has maxSteps (R6) or INVALID_POSITION if the
  // position is outside 1..n + 1. The version row is locked, so requests run one after the other.
  abstract addStep(
    procedureId: string,
    versionId: string,
    step: NewStep,
    maxSteps: number,
  ): Promise<StepResult<StepRecord>>;

  abstract updateStep(
    procedureId: string,
    versionId: string,
    stepId: string,
    changes: StepChanges,
  ): Promise<StepResult<StepRecord>>;

  // Deletes the step and moves the following ones up (R7).
  abstract deleteStep(
    procedureId: string,
    versionId: string,
    stepId: string,
  ): Promise<StepResult<void>>;

  // stepIds holds every step of the draft in the new order (R8); INVALID_ORDER otherwise. The step
  // ids do not change. Returns the steps in the new order.
  abstract reorderSteps(
    procedureId: string,
    versionId: string,
    stepIds: string[],
  ): Promise<StepResult<StepRecord[]>>;
}
