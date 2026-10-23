/* Antes de la suite e2e: deja la base de tests vacía y con todas las migraciones */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { useTestDatabase } from './test-database';

// Último control antes del reset, sobre la URL exacta que va a recibir Prisma:
// solo una base local cuyo nombre termine en _test.
function assertResettable(url: string): void {
  const { hostname, pathname } = new URL(url);
  const database = decodeURIComponent(pathname.replace(/^\//, ''));
  if (hostname !== 'localhost' || !database.endsWith('_test')) {
    throw new Error(
      `No se corre prisma migrate reset contra "${database}" en "${hostname}": ` +
        'la base de tests tiene que estar en localhost y su nombre terminar en _test',
    );
  }
}

export default function globalSetup(): void {
  const testUrl = useTestDatabase();
  assertResettable(testUrl);

  // DATABASE_URL va en el entorno del proceso hijo; prisma.config.ts carga .env con
  // dotenv, que no pisa variables ya definidas, así que reset solo ve la base de tests.
  execSync('pnpm exec prisma migrate reset --force', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
