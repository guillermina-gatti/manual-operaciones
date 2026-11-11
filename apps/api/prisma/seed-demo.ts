/* Seed de demostración de procedimientos (spec 016, HU41): los 8 procedimientos de "Supermercado
La Esquina". Se corre aparte de prisma/seed.ts, desde apps/api:
  pnpm exec ts-node --transpile-only -r ./test/resolve-js-to-ts.cjs prisma/seed-demo.ts
Necesita antes los usuarios y áreas de la pareja A (`prisma db seed`). Solo desarrollo: no corre con
NODE_ENV=production ni contra una base que no esté en localhost. Es idempotente. */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertDevelopmentDatabase } from '../src/procedures/demo/demo-guard';
import { seedDemoProcedures } from '../src/procedures/demo/demo-seed';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const database = assertDevelopmentDatabase(url, process.env.NODE_ENV);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const { written, skipped } = await seedDemoProcedures(prisma);
    console.log(
      `Datos de demostración en "${database}": ${written} procedimientos cargados, ${skipped.length} salteados.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
