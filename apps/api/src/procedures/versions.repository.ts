/* Port to read versions (spec 015, R8 and R9), without depending on Prisma */
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

// The name of whoever published, from the users directory (D6).
export type WithPublisherName<T> = T & { publishedByName: string | null };

export interface VersionsPage {
  data: VersionHistoryRecord[];
  total: number;
}

export abstract class VersionsRepository {
  // One page of the versions, newest first; null if the procedure does not exist (R8).
  abstract list(
    procedureId: string,
    page: number,
    limit: number,
  ): Promise<VersionsPage | null>;

  // One version of that procedure with its steps in order, or null (R9).
  abstract findVersion(
    procedureId: string,
    versionId: string,
  ): Promise<VersionDetailRecord | null>;
}
