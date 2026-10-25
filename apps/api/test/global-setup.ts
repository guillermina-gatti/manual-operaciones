/* Antes de la suite e2e: deja la base de tests vacía y con todas las migraciones */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalTestDatabase, useTestDatabase } from './test-database';

export default function globalSetup(): void {
  const testUrl = useTestDatabase();
  // Último control antes del reset, sobre la URL exacta que va a recibir Prisma.
  assertLocalTestDatabase(testUrl, 'prisma migrate reset');

  // DATABASE_URL va en el entorno del proceso hijo; prisma.config.ts carga .env con
  // dotenv, que no pisa variables ya definidas, así que reset solo ve la base de tests.
  execSync('pnpm exec prisma migrate reset --force', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
