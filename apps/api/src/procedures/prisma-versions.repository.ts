/* Reads the history and the versions in PostgreSQL with Prisma (spec 015, R8 and R9) */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toHistoryRecord, translateUnavailable, versionCount } from './prisma-version-rows';
import { VersionDetailRecord, VersionsPage, VersionsRepository } from './versions.repository';

const detailInclude = {
  ...versionCount,
  steps: {
    orderBy: { stepOrder: 'asc' },
    select: { id: true, stepOrder: true, title: true, description: true },
  },
} satisfies Prisma.ProcedureVersionInclude;

const compareInclude = {
  steps: {
    orderBy: { stepOrder: 'asc' },
    select: { id: true, stepOrder: true, title: true, description: true, stepKey: true },
  },
} satisfies Prisma.ProcedureVersionInclude;

const toCompareVersion = (row: Prisma.ProcedureVersionGetPayload<{ include: typeof compareInclude }>) => ({
  id: row.id,
  versionNumber: row.versionNumber,
  status: row.status,
  steps: row.steps.map((step) => ({
    key: step.stepKey,
    id: step.id,
    order: step.stepOrder,
    title: step.title,
    description: step.description,
  })),
});

@Injectable()
export class PrismaVersionsRepository extends VersionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(procedureId: string, page: number, limit: number): Promise<VersionsPage | null> {
    return translateUnavailable(async () => {
      const procedure = await this.prisma.procedure.findUnique({
        where: { id: procedureId },
        select: { id: true },
      });
      if (!procedure) return null;

      const [rows, total] = await Promise.all([
        this.prisma.procedureVersion.findMany({
          where: { procedureId },
          orderBy: { versionNumber: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: versionCount,
        }),
        this.prisma.procedureVersion.count({ where: { procedureId } }),
      ]);
      return { data: rows.map(toHistoryRecord), total };
    });
  }

  findForCompare(procedureId: string, fromId: string, toId: string) {
    return translateUnavailable(async () => {
      // Inside the procedure: a version of another procedure is not found.
      const rows = await this.prisma.procedureVersion.findMany({
        where: { procedureId, id: { in: [fromId, toId] } },
        include: compareInclude,
      });
      const from = rows.find((row) => row.id === fromId);
      const to = rows.find((row) => row.id === toId);
      return from && to ? { from: toCompareVersion(from), to: toCompareVersion(to) } : null;
    });
  }

  findVersion(procedureId: string, versionId: string): Promise<VersionDetailRecord | null> {
    return translateUnavailable(async () => {
      // Inside the procedure: a version of another procedure is not found.
      const row = await this.prisma.procedureVersion.findFirst({
        where: { id: versionId, procedureId },
        include: detailInclude,
      });
      if (!row) return null;
      return {
        ...toHistoryRecord(row),
        description: row.description,
        steps: row.steps.map((step) => ({
          id: step.id,
          order: step.stepOrder,
          title: step.title,
          description: step.description,
        })),
      };
    });
  }
}
