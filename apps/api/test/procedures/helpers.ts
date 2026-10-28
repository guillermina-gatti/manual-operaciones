/* Integration helpers for procedures: seed and clean data in the test database */

import { randomUUID } from 'node:crypto';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { ProcedureVersionStatus } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface SeedVersion {
  versionNumber: number;
  status: ProcedureVersionStatus;
  title?: string;
  description?: string | null;
  stepTitles?: string[];
}

export interface SeededProcedure {
  procedureId: string;
  versionIds: string[]; // in the order of the received versions
  stepIds: string[][]; // the step ids of each version, by order
}

// Publishing belongs to HU32, so tests insert PUBLISHED and SUPERSEDED versions directly.
export async function seedProcedure(
  prisma: PrismaService,
  options: {
    ownerId?: string;
    areaIds?: string[];
    versions: SeedVersion[];
  },
): Promise<SeededProcedure> {
  const procedureId = randomUUID();
  const ownerId = options.ownerId ?? FIXTURE_USERS.admin.id;
  const versionIds = options.versions.map(() => randomUUID());
  const stepIds = options.versions.map((version) =>
    (version.stepTitles ?? []).map(() => randomUUID()),
  );

  await prisma.procedure.create({
    data: {
      id: procedureId,
      ownerId,
      areas: {
        create: (options.areaIds ?? []).map((areaId) => ({ areaId })),
      },
      versions: {
        create: options.versions.map((version, v) => ({
          id: versionIds[v],
          versionNumber: version.versionNumber,
          status: version.status,
          title: version.title ?? 'Cierre de caja',
          description: version.description ?? null,
          createdById: ownerId,
          steps: {
            create: (version.stepTitles ?? []).map((title, s) => ({
              id: stepIds[v][s],
              stepOrder: s + 1,
              title,
              description: '',
            })),
          },
        })),
      },
    },
  });
  return { procedureId, versionIds, stepIds };
}

// Only the tables of this feature; CASCADE reaches versions, steps and areas.
export async function cleanProcedures(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE procedures CASCADE');
}
