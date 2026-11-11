/* Lists the visible procedures in PostgreSQL with Prisma (spec 006, R13 and R16) */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentVersion, listFilter } from './procedure-access.policy';
import type { ProcedureViewer } from './procedure-access.policy';
import { ListedPage, ListedProcedure, ProcedureListRepository } from './procedure-list.repository';
import { translateUnavailable } from './prisma-version-rows';

// Only the versions a list item can show, and no more of each than it needs.
const listInclude = {
  areas: { select: { areaId: true } },
  versions: {
    where: { status: { in: ['PUBLISHED', 'DRAFT'] } },
    select: {
      id: true,
      versionNumber: true,
      status: true,
      title: true,
      description: true,
      _count: { select: { steps: true } },
    },
  },
} satisfies Prisma.ProcedureInclude;

type ListRow = Prisma.ProcedureGetPayload<{ include: typeof listInclude }>;

// The current version; if there is none, the draft (only an ADMIN gets here with one).
function toListed(row: ListRow): ListedProcedure | null {
  const draft = row.versions.find((version) => version.status === 'DRAFT');
  const shown = currentVersion(row.versions) ?? draft;
  if (!shown) return null;
  const { _count, ...version } = shown;
  return {
    id: row.id,
    createdAt: row.createdAt,
    areaIds: row.areas.map((area) => area.areaId),
    hasOpenDraft: draft !== undefined,
    shown: { ...version, stepCount: _count.steps },
  };
}

@Injectable()
export class PrismaProcedureListRepository extends ProcedureListRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(viewer: ProcedureViewer, page: number, limit: number): Promise<ListedPage> {
    return translateUnavailable(async () => {
      const where = listFilter(viewer);
      const [rows, total] = await Promise.all([
        this.prisma.procedure.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: listInclude,
        }),
        this.prisma.procedure.count({ where }),
      ]);
      return { data: rows.flatMap((row) => toListed(row) ?? []), total };
    });
  }
}
