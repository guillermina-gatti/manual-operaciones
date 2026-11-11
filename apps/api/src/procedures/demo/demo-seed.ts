/* Seed de demostración de procedimientos (spec 016): idempotente, solo tablas de la pareja B,
en una sola transacción. Verifica antes lo de la pareja A y no pisa lo que no es del seed. */
import type { PrismaClient } from '../../generated/prisma/client';
import { DEMO_PROCEDURES } from './demo-procedures';
import { buildOperations } from './demo-operations';
import { checkPrerequisites, findForeignProcedures } from './demo-preflight';

export interface DemoSeedResult {
  written: number;
  skipped: string[]; // ids de los procedimientos que se saltearon (S5)
}

export async function seedDemoProcedures(
  prisma: PrismaClient,
  warn: (message: string) => void = console.warn,
): Promise<DemoSeedResult> {
  await checkPrerequisites(prisma); // S2: antes de escribir nada
  const foreign = await findForeignProcedures(prisma, DEMO_PROCEDURES);
  const mine = DEMO_PROCEDURES.filter((p) => !foreign.has(p.id));
  for (const id of foreign) {
    warn(
      `Se saltea el procedimiento ${id}: tiene versiones o pasos que no son del seed.`,
    );
  }
  await prisma.$transaction(mine.flatMap((p) => buildOperations(prisma, p)));
  return { written: mine.length, skipped: [...foreign] };
}
