/* Areas that only these tests need: an inactive area is created and removed by the test itself */

import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';

// A row of areas with a random id, so it never collides with the fixtures.
export async function createArea(
  prisma: PrismaService,
  isActive: boolean,
): Promise<string> {
  const id = randomUUID();
  await prisma.area.create({
    data: { id, name: `Área de prueba ${id}`, isActive },
  });
  return id;
}

export async function deleteAreas(
  prisma: PrismaService,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await prisma.area.deleteMany({ where: { id: { in: ids } } });
}
