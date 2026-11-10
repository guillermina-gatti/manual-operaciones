/* How the versions use cases publish and read versions, without depending on Prisma (spec 015) */
import type { ProcedureVersionStatus } from '../generated/prisma/client';

// A version as the history shows it. publishedById is a user of Pareja A, by id only.
export interface VersionHistoryRecord {
  id: string;
  procedureId: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  title: string;
  createdAt: Date;
  publishedAt: Date | null;
  publishedById: string | null;
  isCritical: boolean;
  changeSummary: string | null;
  stepCount: number;
}

// A step of a version, in its place (R9). The step key stays inside the repository.
export interface VersionStepRecord {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface VersionDetailRecord extends VersionHistoryRecord {
  description: string | null;
  steps: VersionStepRecord[];
}

// What the service adds to a record: the name of whoever published it, from the users directory (D6).
export type WithPublisherName<T> = T & { publishedByName: string | null };

export interface PublishData {
  procedureId: string;
  versionId: string;
  publishedById: string;
  publishedAt: Date;
  isCritical: boolean;
  changeSummary: string | null;
}

// Why a version was not published (R3). The service answers 404 and 409.
export type PublishRejection = 'NOT_FOUND' | 'NOT_A_DRAFT' | 'NO_STEPS' | 'NO_AREAS';

export type PublishResult =
  | { ok: true; value: VersionHistoryRecord }
  | { ok: false; reason: PublishRejection };

export interface VersionsPage {
  data: VersionHistoryRecord[];
  total: number;
}

export abstract class VersionsRepository {
  // Publishes the draft in one transaction with the procedure row locked (R4): the PUBLISHED one,
  // if any, becomes SUPERSEDED. NOT_FOUND if the version is not in that procedure; NOT_A_DRAFT if it
  // is already PUBLISHED or SUPERSEDED, also when another request published it first.
  abstract publish(data: PublishData): Promise<PublishResult>;

  // The versions of the procedure, newest first, one page; null if the procedure does not exist (R8).
  abstract list(
    procedureId: string,
    page: number,
    limit: number,
  ): Promise<VersionsPage | null>;

  // One version of that procedure with its steps in order, or null if it is not there (R9).
  abstract findVersion(
    procedureId: string,
    versionId: string,
  ): Promise<VersionDetailRecord | null>;
}
