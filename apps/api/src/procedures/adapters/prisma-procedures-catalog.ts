/* Real adapter of the catalog of executions (spec 015, R12): reads the published procedures with Prisma.
It only reads; the port is Mayra's and is not changed */
import { Injectable } from '@nestjs/common';
import { CatalogUnavailableError, ProceduresCatalog } from '../../executions/ports/procedures-catalog';
import type { CatalogProcedureVersion } from '../../executions/ports/procedures-catalog';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isUnavailable } from '../prisma-procedures.repository';

// The steps by order and the areas the procedure has now (the same for all its versions).
const withStepsAndAreas = {
  steps: { orderBy: { stepOrder: 'asc' }, select: { id: true, stepOrder: true, title: true } },
  procedure: { select: { areas: { select: { areaId: true } } } },
} satisfies Prisma.ProcedureVersionInclude;

type VersionRow = Prisma.ProcedureVersionGetPayload<{ include: typeof withStepsAndAreas }>;

// Nothing else of the tables leaves: only what the port declares. The title of the procedure joins
// when the port has it (pending with Mayra, D17).
const toCatalogVersion = (row: VersionRow): CatalogProcedureVersion => ({
  procedureId: row.procedureId,
  versionId: row.id,
  areaIds: row.procedure.areas.map((area) => area.areaId).sort(),
  steps: row.steps.map((step) => ({ id: step.id, order: step.stepOrder, title: step.title })),
});

@Injectable()
export class PrismaProceduresCatalog extends ProceduresCatalog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // The current version: the most recent PUBLISHED one. Without steps it counts as not published.
  findPublished(procedureId: string): Promise<CatalogProcedureVersion | null> {
    return this.read(async () => {
      const row = await this.prisma.procedureVersion.findFirst({
        where: { procedureId, status: 'PUBLISHED' },
        orderBy: { versionNumber: 'desc' },
        include: withStepsAndAreas,
      });
      return row && row.steps.length > 0 ? toCatalogVersion(row) : null;
    });
  }

  // Any version, also a SUPERSEDED one: an execution keeps the one it started with.
  findVersion(versionId: string): Promise<CatalogProcedureVersion | null> {
    return this.read(async () => {
      const row = await this.prisma.procedureVersion.findUnique({
        where: { id: versionId },
        include: withStepsAndAreas,
      });
      return row ? toCatalogVersion(row) : null;
    });
  }

  private async read<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (isUnavailable(error)) {
        throw new CatalogUnavailableError('El catálogo de procedimientos no responde', {
          cause: error,
        });
      }
      throw error;
    }
  }
}
