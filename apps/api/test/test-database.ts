/* Elige la base de los tests de integración y corta si no es una base de tests */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, parse } from 'dotenv';

const envFile = resolve(__dirname, '../.env');

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

// Devuelve TEST_DATABASE_URL y la deja en DATABASE_URL, así PrismaService y prisma migrate
// nunca ven la base de desarrollo. Lanza si falta, si el nombre no termina en _test
// o si es la misma URL que el DATABASE_URL de .env.
export function useTestDatabase(): string {
  config({ path: envFile, quiet: true });

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'Falta TEST_DATABASE_URL: los tests de integración no corren contra la base de desarrollo',
    );
  }
  if (!databaseName(testUrl).endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL apunta a "${databaseName(testUrl)}": el nombre de la base tiene que terminar en _test`,
    );
  }
  const devUrl = existsSync(envFile)
    ? parse(readFileSync(envFile)).DATABASE_URL
    : undefined;
  if (devUrl && devUrl === testUrl) {
    throw new Error('TEST_DATABASE_URL es igual a DATABASE_URL de desarrollo');
  }

  process.env.DATABASE_URL = testUrl;
  return testUrl;
}
