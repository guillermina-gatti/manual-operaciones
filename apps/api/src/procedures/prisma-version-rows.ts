/* What the Prisma repositories of versions share: the step count, the row mapping and the 503 */
import type { Prisma } from '../generated/prisma/client';
import { isUnavailable } from './prisma-procedures.repository';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type { VersionHistoryRecord } from './versions.repository';

export const versionCount = {
  _count: { select: { steps: true } },
} satisfies Prisma.ProcedureVersionInclude;

export type VersionRow = Prisma.ProcedureVersionGetPayload<{
  include: typeof versionCount;
}>;

// Field by field, so nothing internal (createdById) leaves the repository.
export function toHistoryRecord(row: VersionRow): VersionHistoryRecord {
  return {
    id: row.id,
    procedureId: row.procedureId,
    versionNumber: row.versionNumber,
    status: row.status,
    title: row.title,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    publishedById: row.publishedById,
    isCritical: row.isCritical,
    changeSummary: row.changeSummary,
    stepCount: row._count.steps,
  };
}

// A database that does not answer is a ProceduresRepositoryUnavailableError (503).
export async function translateUnavailable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUnavailable(error)) {
      throw new ProceduresRepositoryUnavailableError('La base de datos no responde', {
        cause: error,
      });
    }
    throw error;
  }
}
