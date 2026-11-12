/* Publishes a draft in PostgreSQL with Prisma (spec 015, R2 to R5) */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TRANSACTION_OPTIONS,
  isUniqueViolationOn,
  lockProcedure,
} from './prisma-procedures.repository';
import { toHistoryRecord, translateUnavailable, versionCount } from './prisma-version-rows';
import { PublishData, PublishRejection, PublishRepository, PublishResult } from './publish.repository';

// The partial unique index of the migration add_procedure_versions (R4, D5).
const ONE_PUBLISHED_INDEX = 'procedure_versions_one_published_idx';

const rejected = (reason: PublishRejection) => ({ ok: false, reason }) as const;

@Injectable()
export class PrismaPublishRepository extends PublishRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async publish(data: PublishData): Promise<PublishResult> {
    try {
      return await translateUnavailable(() =>
        this.prisma.$transaction(async (tx) => {
          if (!(await lockProcedure(tx, data.procedureId))) return rejected('NOT_FOUND');

          // Inside the procedure: a version of another procedure is not found.
          const version = await tx.procedureVersion.findFirst({
            where: { id: data.versionId, procedureId: data.procedureId },
            select: { status: true, _count: { select: { steps: true } } },
          });
          if (!version) return rejected('NOT_FOUND');
          if (version.status !== 'DRAFT') return rejected('NOT_A_DRAFT');
          if (version._count.steps === 0) return rejected('NO_STEPS');
          const areas = await tx.procedureArea.count({ where: { procedureId: data.procedureId } });
          if (areas === 0) return rejected('NO_AREAS');

          // R4: the PUBLISHED one steps aside before the new one takes its place.
          await tx.procedureVersion.updateMany({
            where: { procedureId: data.procedureId, status: 'PUBLISHED' },
            data: { status: 'SUPERSEDED' },
          });
          const published = await tx.procedureVersion.update({
            where: { id: data.versionId },
            data: {
              status: 'PUBLISHED',
              publishedAt: data.publishedAt,
              publishedById: data.publishedById,
              isCritical: data.isCritical,
              changeSummary: data.changeSummary,
            },
            include: versionCount,
          });
          return { ok: true, value: toHistoryRecord(published) } as const;
        }, TRANSACTION_OPTIONS),
      );
    } catch (error) {
      // The lock makes this rare; the index is the safety net.
      if (isUniqueViolationOn(error, ONE_PUBLISHED_INDEX)) return rejected('NOT_A_DRAFT');
      throw error;
    }
  }
}
