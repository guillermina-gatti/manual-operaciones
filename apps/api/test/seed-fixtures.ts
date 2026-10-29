/* Carga los usuarios y áreas de prueba en la base de tests (manual_test): `pnpm --filter api seed:fixtures`.
Para los Playwright contra la API real (T28 de la spec 003 y la integración de la spec 002), con la API
levantada contra esa misma base. Nunca escribe en la base de desarrollo: toma TEST_DATABASE_URL (de
apps/api/.env o del entorno), no DATABASE_URL, y se niega a correr si no es una base local _test.
Los usuarios quedan con la contraseña de desarrollo (DEV_FIXTURE_PASSWORD), con la que la web inicia sesión. */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedDirectoryFixtures } from './directory-fixtures';
import { assertLocalTestDatabase, useTestDatabase } from './test-database';

async function main(): Promise<void> {
  const url = useTestDatabase();
  assertLocalTestDatabase(url, 'seed:fixtures');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    await seedDirectoryFixtures(prisma);
    const [areas, users] = await Promise.all([
      prisma.area.count(),
      prisma.user.count(),
    ]);
    console.log(
      `Fixtures cargados en "${new URL(url).pathname.slice(1)}": ${areas} áreas y ${users} usuarios en total.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
