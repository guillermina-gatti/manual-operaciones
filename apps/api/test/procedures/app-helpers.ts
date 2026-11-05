/* Integration harness for the procedures routes: the whole app as in main.ts, against the test database */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { DirectoryUser } from '../../src/documents/ports/users-directory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { signTestJwt } from '../auth/helpers';
import { seedDirectoryFixtures } from '../directory-fixtures';

export interface ProceduresTestApp {
  app: INestApplication;
  prisma: PrismaService;
}

// Boots the whole AppModule with no provider overridden, so the controller, the service and
// the Prisma repository are the real ones. Prisma points to the test database (test/setup-env.ts).
export async function createProceduresTestApp(): Promise<ProceduresTestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  await seedDirectoryFixtures(prisma);
  return { app, prisma };
}

// A real JWT signed with JWT_SECRET, as the login issues it. The guard only reads `sub`:
// role and areas come from the users seeded above (seedDirectoryFixtures), so `role` here
// is informative.
export const authHeaders = (user: Pick<DirectoryUser, 'id' | 'role'>) => ({
  Authorization: `Bearer ${signTestJwt({ sub: user.id, role: user.role })}`,
});
