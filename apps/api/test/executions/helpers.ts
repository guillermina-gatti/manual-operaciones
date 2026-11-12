/* Integration harness for executions: the whole app as in main.ts, against the test database */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { DirectoryUser } from '../../src/documents/ports/users-directory';
import { InMemoryProceduresCatalog } from '../../src/executions/adapters/in-memory-procedures-catalog';
import { ProceduresCatalog } from '../../src/executions/ports/procedures-catalog';
import { PrismaService } from '../../src/prisma/prisma.service';
import { signTestJwt } from '../auth/helpers';
import { seedDirectoryFixtures } from '../directory-fixtures';

// A second Ventas employee, so the cross-employee 404 comes from ownership and not
// from areas. Only exists in the test database (manual_test).
export const OTRO_EMPLEADO_VENTAS: DirectoryUser = {
  id: '0b000000-0000-4000-8000-000000000099',
  name: 'Otra Empleada de Ventas',
  role: 'EMPLOYEE',
  areaIds: [AREA_IDS.ventas],
  isActive: true,
};

export interface ExecutionsTestApp {
  app: INestApplication;
  prisma: PrismaService;
  catalog: InMemoryProceduresCatalog;
}

// Boots the whole AppModule. The procedures catalog is an instance owned by the test,
// so it can move a procedure to another area or publish a version. Prisma points to
// the test database (test/setup-env.ts).
export async function createExecutionsTestApp(): Promise<ExecutionsTestApp> {
  const catalog = new InMemoryProceduresCatalog();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ProceduresCatalog)
    .useValue(catalog)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  await seedDirectoryFixtures(prisma);
  await seedSecondVentasEmployee(prisma);
  return { app, prisma, catalog };
}

// Idempotent, like seedDirectoryFixtures.
async function seedSecondVentasEmployee(prisma: PrismaService): Promise<void> {
  const { id, name, role, areaIds } = OTRO_EMPLEADO_VENTAS;
  const data = {
    name,
    email: 'otroempleadoventas@executions.test',
    passwordHash: '!fixture-sin-contraseña', // not a bcrypt hash: cannot log in
    role,
    isActive: true,
  };
  await prisma.$transaction([
    prisma.user.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    }),
    prisma.userArea.deleteMany({ where: { userId: id } }),
    prisma.userArea.createMany({
      data: areaIds.map((areaId) => ({ userId: id, areaId })),
    }),
  ]);
}

// For the afterAll of each suite: removes the users and areas seeded above, so suites that
// count the whole directory (A-15) do not find them. Every suite that needs them seeds them
// again in its beforeAll. An area another user still belongs to is left in place.
export async function closeExecutionsTestApp(
  t: ExecutionsTestApp,
): Promise<void> {
  const userIds = [
    ...Object.values(FIXTURE_USERS).map((user) => user.id),
    OTRO_EMPLEADO_VENTAS.id,
  ];
  await t.prisma.$transaction([
    t.prisma.userArea.deleteMany({ where: { userId: { in: userIds } } }),
    t.prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    t.prisma.area.deleteMany({
      where: { id: { in: Object.values(AREA_IDS) }, users: { none: {} } },
    }),
  ]);
  await t.app.close();
}

// Only the tables of this feature; documents and the directory are left alone.
export async function cleanExecutions(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE execution_steps, executions CASCADE',
  );
}

// A real JWT signed with JWT_SECRET, as the login issues it. The guard only reads `sub`:
// role and areas come from the users seeded above, so `role` here is informative.
export const authHeaders = (user: Pick<DirectoryUser, 'id' | 'role'>) => ({
  Authorization: `Bearer ${signTestJwt({ sub: user.id, role: user.role })}`,
});
