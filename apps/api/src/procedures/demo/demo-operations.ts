/* Las escrituras de un procedimiento de demostración, para una sola transacción (spec 016) */
import type { PrismaClient } from '../../generated/prisma/client';
import { DEMO_ADMIN_ID, DEMO_AREA_IDS } from './demo-ids';
import type { DemoProcedure, DemoStep, DemoVersion } from './demo-types';

function versionData(version: DemoVersion) {
  const published = version.publishedAt !== null;
  return {
    versionNumber: version.versionNumber,
    status: version.status,
    title: version.title,
    description: version.description,
    createdById: DEMO_ADMIN_ID,
    createdAt: version.createdAt,
    publishedAt: version.publishedAt,
    publishedById: published ? DEMO_ADMIN_ID : null,
    isCritical: version.isCritical,
    changeSummary: version.changeSummary,
  };
}

function stepData(step: DemoStep, order: number) {
  return {
    stepOrder: order,
    title: step.title,
    description: step.description,
    stepKey: step.stepKey,
  };
}

function versionOperations(prisma: PrismaClient, procedure: DemoProcedure) {
  return [...procedure.versions]
    .sort((a, b) => a.versionNumber - b.versionNumber)
    .flatMap((version) => {
      const data = versionData(version);
      return [
        prisma.procedureVersion.upsert({
          where: { id: version.id },
          create: { id: version.id, procedureId: procedure.id, ...data },
          update: data,
        }),
        ...version.steps.map((step, index) => {
          const fields = stepData(step, index + 1);
          return prisma.step.upsert({
            where: { id: step.id },
            create: { id: step.id, procedureVersionId: version.id, ...fields },
            update: fields,
          });
        }),
      ];
    });
}

// Procedimiento, áreas, y después las versiones (V1 antes que V2) con sus pasos.
export function buildOperations(
  prisma: PrismaClient,
  procedure: DemoProcedure,
) {
  const createdAt = procedure.versions[0].createdAt;
  return [
    prisma.procedure.upsert({
      where: { id: procedure.id },
      create: { id: procedure.id, ownerId: DEMO_ADMIN_ID, createdAt },
      update: { ownerId: DEMO_ADMIN_ID },
    }),
    prisma.procedureArea.deleteMany({ where: { procedureId: procedure.id } }),
    prisma.procedureArea.createMany({
      data: procedure.areas.map((area) => ({
        procedureId: procedure.id,
        areaId: DEMO_AREA_IDS[area],
      })),
    }),
    ...versionOperations(prisma, procedure),
  ];
}
