/* Port to list the procedures that a viewer can see (spec 006, R13 and R16), without Prisma */
import type { ProcedureVersionStatus } from '../generated/prisma/client';
import type { ProcedureViewer } from './procedure-access.policy';

// The version a list item shows: the current one or, for an ADMIN, the draft of a procedure that
// was never published (P21, P24).
export interface ListedVersion {
  id: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  title: string;
  description: string | null;
  stepCount: number;
}

export interface ListedProcedure {
  id: string;
  createdAt: Date;
  areaIds: string[];
  shown: ListedVersion;
  hasOpenDraft: boolean;
}

export interface ListedPage {
  data: ListedProcedure[];
  total: number;
}

export abstract class ProcedureListRepository {
  // One page of the procedures the viewer can see, newest first (ties by id), with the total.
  // The visibility filter is the one of the access policy; this only runs it.
  abstract list(
    viewer: ProcedureViewer,
    page: number,
    limit: number,
  ): Promise<ListedPage>;
}
