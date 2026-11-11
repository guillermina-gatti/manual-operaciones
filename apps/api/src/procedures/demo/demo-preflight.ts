/* Verificaciones previas al seed de demostración, antes de escribir nada (spec 016, S2 y S5) */
import type { PrismaClient } from '../../generated/prisma/client';
import { DEMO_ADMIN_ID, DEMO_AREA_IDS } from './demo-ids';
import type { DemoProcedure } from './demo-types';

// S2: el admin y las dos áreas son de la pareja A; si faltan, no se escribe nada.
export async function checkPrerequisites(prisma: PrismaClient): Promise<void> {
  const expected = Object.values(DEMO_AREA_IDS);
  const [admins, areas] = await Promise.all([
    prisma.user.count({ where: { id: DEMO_ADMIN_ID } }),
    prisma.area.findMany({
      where: { id: { in: expected } },
      select: { id: true },
    }),
  ]);
  const missing: string[] = [];
  if (admins === 0) missing.push(`el usuario admin ${DEMO_ADMIN_ID}`);
  const found = new Set(areas.map((area) => area.id));
  for (const id of expected) if (!found.has(id)) missing.push(`el área ${id}`);
  if (missing.length > 0) {
    throw new Error(
      `Faltan datos de la pareja A: ${missing.join(', ')}. Corré antes "prisma db seed". No se escribió nada.`,
    );
  }
}

// S5: los procedimientos demo que ya tienen versiones o pasos que no son del seed.
export async function findForeignProcedures(
  prisma: PrismaClient,
  procedures: DemoProcedure[],
): Promise<Set<string>> {
  const rows = await prisma.procedureVersion.findMany({
    where: { procedureId: { in: procedures.map((p) => p.id) } },
    select: { id: true, procedureId: true, steps: { select: { id: true } } },
  });
  const foreign = new Set<string>();
  for (const procedure of procedures) {
    const versions = new Map(procedure.versions.map((v) => [v.id, v]));
    const mine = rows.filter((row) => row.procedureId === procedure.id);
    const isForeign = mine.some((row) => {
      const known = versions.get(row.id);
      if (!known) return true;
      const stepIds = new Set(known.steps.map((s) => s.id));
      return row.steps.some((step) => !stepIds.has(step.id));
    });
    if (isForeign) foreign.add(procedure.id);
  }
  return foreign;
}
