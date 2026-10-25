/* Usuarios y áreas de prueba en la base de tests, con los UUID de los fixtures (0a… áreas, 0b… usuarios) */

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

// password_hash es obligatorio. Este valor no es un hash de bcrypt: con él no se puede iniciar sesión.
const NO_PASSWORD = '!fixture-sin-contraseña';

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
        email: `${key.toLowerCase()}@fixtures.test`,
        passwordHash: NO_PASSWORD,
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
