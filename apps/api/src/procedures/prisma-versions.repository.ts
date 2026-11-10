/* Publishes and reads versions in PostgreSQL with Prisma (spec 015). A database that does not answer
becomes ProceduresRepositoryUnavailableError, which the API turns into a 503 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TRANSACTION_OPTIONS,
  isUnavailable,
  isUniqueViolationOn,
  lockProcedure,
} from './prisma-procedures.repository';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import {
  PublishData,
  PublishResult,
  VersionDetailRecord,
  VersionHistoryRecord,
  VersionsPage,
  VersionsRepository,
} from './versions.repository';

// The partial unique index of the migration add_procedure_versions (R4, D5).
const ONE_PUBLISHED_INDEX = 'procedure_versions_one_published_idx';

const versionCount = {
  _count: { select: { steps: true } },
} satisfies Prisma.ProcedureVersionInclude;

const detailInclude = {
  ...versionCount,
  steps: {
    orderBy: { stepOrder: 'asc' },
    select: { id: true, stepOrder: true, title: true, description: true },
  },
} satisfies Prisma.ProcedureVersionInclude;

type VersionRow = Prisma.ProcedureVersionGetPayload<{ include: typeof versionCount }>;
type DetailRow = Prisma.ProcedureVersionGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class PrismaVersionsRepository extends VersionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async publish(data: PublishData): Promise<PublishResult> {
    try {
      return await this.translate(() =>
        this.prisma.$transaction(async (tx) => {
          if (!(await lockProcedure(tx, data.procedureId))) return notFound;

          // Inside the procedure: a version of another procedure is not found.
          const version = await tx.procedureVersion.findFirst({
            where: { id: data.versionId, procedureId: data.procedureId },
            select: { status: true, _count: { select: { steps: true } } },
          });
          if (!version) return notFound;
          if (version.status !== 'DRAFT') return rejected('NOT_A_DRAFT');
          if (version._count.steps === 0) return rejected('NO_STEPS');
          if ((await tx.procedureArea.count({ where: { procedureId: data.procedureId } })) === 0) {
            return rejected('NO_AREAS');
          }

          // The one that was PUBLISHED, if any, steps aside before the new one takes its place.
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
      // The lock makes this rare; the index is the safety net if something else wrote a PUBLISHED.
      if (isUniqueViolationOn(error, ONE_PUBLISHED_INDEX)) return rejected('NOT_A_DRAFT');
      throw error;
    }
  }

  async list(procedureId: string, page: number, limit: number): Promise<VersionsPage | null> {
    return this.translate(async () => {
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
    return this.translate(async () => {
      const row = await this.prisma.procedureVersion.findFirst({
        where: { id: versionId, procedureId },
        include: detailInclude,
      });
      return row ? toDetailRecord(row) : null;
    });
  }

  private async translate<T>(operation: () => Promise<T>): Promise<T> {
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
}

const rejected = (reason: 'NOT_FOUND' | 'NOT_A_DRAFT' | 'NO_STEPS' | 'NO_AREAS') =>
  ({ ok: false, reason }) as const;
const notFound = rejected('NOT_FOUND');

// Field by field, so nothing internal (createdById) leaves the repository.
function toHistoryRecord(row: VersionRow): VersionHistoryRecord {
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

function toDetailRecord(row: DetailRow): VersionDetailRecord {
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
}
