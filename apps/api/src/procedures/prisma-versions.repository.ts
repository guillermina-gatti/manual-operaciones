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
