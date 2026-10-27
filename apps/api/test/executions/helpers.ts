/* Integration harness for executions: the whole app as in main.ts, against the test database */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import type { DirectoryUser } from '../../src/documents/ports/users-directory';
import { InMemoryProceduresCatalog } from '../../src/executions/adapters/in-memory-procedures-catalog';
import { ProceduresCatalog } from '../../src/executions/ports/procedures-catalog';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seedDirectoryFixtures } from '../directory-fixtures';

// A second Ventas employee, so the cross-employee 404 comes from ownership and not
// from areas. Only exists in the test database (manual_test).
export const OTRO_EMPLEADO_VENTAS: DirectoryUser = {
  id: '0b000000-0000-4000-8000-000000000099',
  role: 'EMPLOYEE',
  areaIds: [AREA_IDS.ventas],
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
  const { id, role, areaIds } = OTRO_EMPLEADO_VENTAS;
  const data = {
    name: 'Otra Empleada de Ventas',
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

// Only the tables of this feature; documents and the directory are left alone.
export async function cleanExecutions(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE execution_steps, executions CASCADE',
  );
}

export const authHeaders = (user: Pick<DirectoryUser, 'id' | 'role'>) => ({
  'x-user-id': user.id,
  'x-user-role': user.role,
});
