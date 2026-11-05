/* Spec 008 (T13): siembra para el Playwright de referencias (apps/web/e2e/integracion/referencias.spec.ts).
Crea en la base de tests (manual_test) un responsable y un área propios de la corrida, un documento de
Ventas y de esa área con ese responsable, y después desactiva a los dos: no hay endpoint para desactivar,
y la API rechaza cargar con un responsable o un área inactivos (R5, R7). Imprime los IDs en JSON.

Nunca escribe en la base de desarrollo: como seed-fixtures.ts, toma TEST_DATABASE_URL (de apps/api/.env
o del entorno), no DATABASE_URL, y se niega a correr si no es una base local _test.

Uso (desde apps/api): ts-node --transpile-only -r ./test/resolve-js-to-ts.cjs \
  test/documents/seed-references.ts <marca única> */

import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { PrismaClient } from '../../src/generated/prisma/client';
import { assertLocalTestDatabase, useTestDatabase } from '../test-database';

export interface SeededReferences {
  documentId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  areaId: string;
  areaName: string;
}

async function main(): Promise<void> {
  const run = process.argv[2];
  if (!run) throw new Error('Falta la marca única de la corrida');

  const url = useTestDatabase();
  assertLocalTestDatabase(url, 'seed de referencias (spec 008)');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const ownerId = randomUUID();
    const areaId = randomUUID();
    const documentId = randomUUID();
    const versionId = randomUUID();
    const seeded: SeededReferences = {
      documentId,
      title: `[e2e] Referencias ${run}`,
      ownerId,
      ownerName: `Ana Pérez ${run}`,
      areaId,
      // El nombre del área es único en la base.
      areaName: `Compras ${run}`,
    };

    await prisma.$transaction(async (tx) => {
      await tx.area.create({
        data: { id: areaId, name: seeded.areaName, isActive: true },
      });
      // EMPLOYEE de Ventas: conserva el acceso al documento aunque se le agregue Operaciones (E15).
      await tx.user.create({
        data: {
          id: ownerId,
          name: seeded.ownerName,
          email: `e2e-${ownerId}@fixtures.test.invalid`,
          // Nunca inicia sesión: solo es responsable.
          passwordHash: 'x',
          role: 'EMPLOYEE',
          isActive: true,
          areas: { create: [{ areaId: AREA_IDS.ventas }] },
        },
      });
      await tx.document.create({
        data: {
          id: documentId,
          title: seeded.title,
          status: 'ACTIVE',
          ownerId,
          reviewDate: new Date('2030-01-15'),
          createdById: FIXTURE_USERS.admin.id,
          areas: {
            createMany: {
              data: [{ areaId: AREA_IDS.ventas }, { areaId }],
            },
          },
          versions: {
            create: {
              id: versionId,
              versionNumber: 1,
              storageKey: `documents/${documentId}/${versionId}.pdf`,
              originalFileName: 'referencias.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              checksum: randomUUID().replace(/-/g, '').padEnd(64, '0'),
              uploadedById: FIXTURE_USERS.admin.id,
            },
          },
        },
      });
      // Desactivarlos no cambia el documento (E18): siguen siendo su responsable y su área.
      await tx.user.update({
        where: { id: ownerId },
        data: { isActive: false },
      });
      await tx.area.update({
        where: { id: areaId },
        data: { isActive: false },
      });
    });

    console.log(JSON.stringify(seeded));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
