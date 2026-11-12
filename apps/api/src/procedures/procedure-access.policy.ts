/* Who can manage and who can see a procedure (spec 006, R1, R13, R14 and R15) */
import type { Role } from '../common/auth';
import type {
  Prisma,
  ProcedureVersionStatus,
} from '../generated/prisma/client';

// Who is asking. The role comes from the session; the areas come from UsersDirectory on every
// request, never from the session (R15).
export interface ProcedureViewer {
  role: Role;
  areaIds: string[];
}

// What the policy needs to know about a version.
export interface PolicyVersion {
  versionNumber: number;
  status: ProcedureVersionStatus;
  stepCount: number;
}

// What the policy needs to know about a procedure: its areas right now (R11) and its versions.
export interface ViewableProcedure {
  areaIds: string[];
  versions: PolicyVersion[];
}

const sharesArea = (viewerAreaIds: string[], procedureAreaIds: string[]) =>
  procedureAreaIds.some((areaId) => viewerAreaIds.includes(areaId));

// R1: only an ADMIN creates, edits and deletes drafts, and assigns areas.
export function canManage(role: Role): boolean {
  return role === 'ADMIN';
}

// The current version is the most recent PUBLISHED one; null when there is none (a DRAFT and
// a SUPERSEDED are never the current one).
export function currentVersion<
  T extends { versionNumber: number; status: ProcedureVersionStatus },
>(versions: readonly T[]): T | null {
  return versions
    .filter((version) => version.status === 'PUBLISHED')
    .reduce<T | null>(
      (latest, version) =>
        latest === null || version.versionNumber > latest.versionNumber
          ? version
          : latest,
      null,
    );
}

// R13 and R14: an ADMIN sees everything. Anyone else sees a procedure only if its current
// version has at least one step (a PUBLISHED without steps counts as not published, like in
// the executions catalog) and shares an area with it.
export function canViewProcedure(
  viewer: ProcedureViewer,
  procedure: ViewableProcedure,
): boolean {
  if (viewer.role === 'ADMIN') return true;
  const current = currentVersion(procedure.versions);
  return (
    current !== null &&
    current.stepCount > 0 &&
    sharesArea(viewer.areaIds, procedure.areaIds)
  );
}

// R13 and R16: the same rule as canViewProcedure, as a Prisma filter for the list. Publishing
// leaves a single PUBLISHED version (the previous one becomes SUPERSEDED), so "some PUBLISHED with
// steps" is the same as "the current one has steps". The repository only translates it to SQL.
export function listFilter(viewer: ProcedureViewer): Prisma.ProcedureWhereInput {
  if (viewer.role === 'ADMIN') return {};
  return {
    areas: { some: { areaId: { in: viewer.areaIds } } },
    versions: { some: { status: 'PUBLISHED', steps: { some: {} } } },
  };
}
