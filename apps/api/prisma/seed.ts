/* Seed de desarrollo: las 2 áreas y los 5 usuarios de los fixtures, con los mismos UUID que usan
la web (selector de sesión, DevSessionSwitcher) y los tests. Se corre con `pnpm --filter api exec
prisma db seed` (migrations.seed en prisma.config.ts). Solo para desarrollo: no corre con
NODE_ENV=production ni contra una base que no esté en localhost. Es idempotente.
Los 5 usuarios quedan con la contraseña de desarrollo DEV_FIXTURE_PASSWORD (test/directory-fixtures.ts),
conocida a propósito y SOLO PARA DESARROLLO Y TESTS: con ella el selector de sesión de la web inicia
sesión de verdad. */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  DEV_FIXTURE_PASSWORD,
  seedDirectoryFixtures,
} from '../test/directory-fixtures';

function assertDevelopmentDatabase(url: string | undefined): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de desarrollo no corre con NODE_ENV=production');
  }
  if (!url) {
    throw new Error('Falta DATABASE_URL');
  }
  const { hostname, pathname } = new URL(url);
  if (hostname !== 'localhost') {
    throw new Error(
      `El seed de desarrollo solo corre contra una base en localhost, no en "${hostname}"`,
    );
  }
  return decodeURIComponent(pathname.replace(/^\//, ''));
}

async function main(): Promise<void> {
  // dotenv no pisa variables ya definidas: un DATABASE_URL del comando gana sobre el de .env.
  const url = process.env.DATABASE_URL;
  const database = assertDevelopmentDatabase(url);

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
      `Seed de desarrollo cargado en "${database}": ${areas} áreas y ${users} usuarios en total.`,
    );
    console.log(
      `Los usuarios de prueba (…@fixtures.test) entran con la contraseña de desarrollo "${DEV_FIXTURE_PASSWORD}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
