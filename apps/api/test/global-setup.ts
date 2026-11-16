/* Antes de la suite e2e: verifica aislamiento en manual_e2e_test y aplica migraciones pendientes sin resetear datos */

import './resolve-js-to-ts.cjs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  E2E_DATABASE_NAME,
  assertLocalE2eDatabase,
  useE2eDatabase,
} from './test-database';

export default async function globalSetup(): Promise<void> {
  const e2eUrl = useE2eDatabase();
  // Control estricto antes de conectar o migrar: solo localhost/127.0.0.1 y exactamente manual_e2e_test.
  assertLocalE2eDatabase(e2eUrl, 'prisma migrate deploy');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: e2eUrl }),
  });

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ current_database: string }>
    >('SELECT current_database()');
    const connectedDatabase = rows[0]?.current_database;
    if (connectedDatabase !== E2E_DATABASE_NAME) {
      throw new Error(
        `Operación E2E abortada: PostgreSQL reportó current_database()="${connectedDatabase ?? 'desconocida'}" (se esperaba "${E2E_DATABASE_NAME}")`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  // DATABASE_URL va en el entorno del proceso hijo apuntando exclusivamente a E2E_DATABASE_URL;
  // prisma migrate deploy aplica migraciones pendientes de forma no destructiva.
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: e2eUrl },
    stdio: 'inherit',
  });
}
