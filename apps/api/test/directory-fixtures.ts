/* Usuarios y áreas de prueba en la base de tests, con los UUID de los fixtures (0a… áreas, 0b… usuarios) */

import { PasswordService } from '../src/auth/password.service';
import type { PrismaClient } from '../src/generated/prisma/client';
import { AREA_IDS, FIXTURE_USERS } from '../src/documents/adapters/fixtures';

// Desde A-04 los directorios leen las tablas users, areas y user_areas de la pareja A. Los tests
// (y los fixtures de la web, con los mismos UUID) dan por hecho que estos existen.
const AREA_NAMES: Record<keyof typeof AREA_IDS, string> = {
  ventas: 'Ventas',
  operaciones: 'Operaciones',
};

// Los mismos nombres que apps/web/lib/directory/fixtures.ts.
const USER_NAMES: Record<keyof typeof FIXTURE_USERS, string> = {
  admin: 'Ana Administradora',
  supervisorVentas: 'Sergio Supervisor de Ventas',
  empleadoVentas: 'Elena Empleada de Ventas',
  supervisorOperaciones: 'Sofía Supervisora de Operaciones',
  empleadoOperaciones: 'Emilio Empleado de Operaciones',
};

// SOLO PARA DESARROLLO Y TESTS. La contraseña de los 5 usuarios de los fixtures, conocida a propósito:
// con ella el selector de sesión de la web (DevSessionSwitcher) inicia sesión de verdad con
// POST /api/auth/login. La misma que apps/web/lib/session/dev-credentials.ts. Nunca debe existir un
// usuario real con ella: el seed no corre en producción ni fuera de localhost (prisma/seed.ts).
export const DEV_FIXTURE_PASSWORD = 'dev-fixtures-2026';

// El email de cada usuario de los fixtures, por ejemplo supervisorventas@fixtures.test.
export const fixtureEmail = (key: keyof typeof FIXTURE_USERS): string =>
  `${key.toLowerCase()}@fixtures.test`;

// El hash bcrypt (el PasswordService de la pareja A), calculado una vez por proceso: cuesta ~70 ms.
let devPasswordHash: Promise<string> | null = null;
const getDevPasswordHash = () =>
  (devPasswordHash ??= new PasswordService().hash(DEV_FIXTURE_PASSWORD));

// Idempotente: deja las 2 áreas, los 5 usuarios y sus áreas exactamente como en los fixtures,
// sin importar cuántas veces se llame. No toca otros usuarios ni otras áreas.
export async function seedDirectoryFixtures(
  prisma: PrismaClient,
): Promise<void> {
  const areas = Object.entries(AREA_IDS) as [keyof typeof AREA_IDS, string][];
  const users = Object.entries(FIXTURE_USERS) as [
    keyof typeof FIXTURE_USERS,
    (typeof FIXTURE_USERS)[keyof typeof FIXTURE_USERS],
  ][];
  const passwordHash = await getDevPasswordHash();

  await prisma.$transaction([
    ...areas.map(([key, id]) =>
      prisma.area.upsert({
        where: { id },
        create: { id, name: AREA_NAMES[key] },
        update: { name: AREA_NAMES[key], isActive: true },
      }),
    ),
    ...users.map(([key, user]) => {
      const data = {
        name: USER_NAMES[key],
        email: fixtureEmail(key),
        passwordHash,
        role: user.role,
        isActive: true,
      };
      return prisma.user.upsert({
        where: { id: user.id },
        create: { id: user.id, ...data },
        update: data,
      });
    }),
    // Las áreas de cada usuario, ni una más ni una menos.
    prisma.userArea.deleteMany({
      where: { userId: { in: users.map(([, user]) => user.id) } },
    }),
    prisma.userArea.createMany({
      data: users.flatMap(([, user]) =>
        user.areaIds.map((areaId) => ({ userId: user.id, areaId })),
      ),
    }),
  ]);
}
