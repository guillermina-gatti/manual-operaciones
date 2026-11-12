/* Los usuarios de los fixtures inician sesión con la contraseña de desarrollo (la sesión de la web, plan 002, 3.1) */

import request from 'supertest';
import { PasswordService } from '../src/auth/password.service';
import { FIXTURE_USERS } from '../src/documents/adapters/fixtures';
import {
  DEV_FIXTURE_PASSWORD,
  fixtureEmail,
  seedDirectoryFixtures,
} from './directory-fixtures';
import { AuthTestApp, createAuthTestApp } from './auth/helpers';

describe('usuarios de los fixtures (seed de desarrollo y de tests)', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    // El arnés de la pareja A: conecta Redis (el rate limiter del login) y comprueba que sea el de tests.
    t = await createAuthTestApp();
    await seedDirectoryFixtures(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  const users = Object.entries(FIXTURE_USERS) as [
    keyof typeof FIXTURE_USERS,
    (typeof FIXTURE_USERS)[keyof typeof FIXTURE_USERS],
  ][];

  it.each(users)(
    '%s inicia sesión con su email y la contraseña de desarrollo',
    async (key, fixture) => {
      const res = await request(t.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: fixtureEmail(key), password: DEV_FIXTURE_PASSWORD })
        .expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        user: { id: fixture.id, role: fixture.role, email: fixtureEmail(key) },
      });
    },
  );

  it('guarda un hash bcrypt que no acepta otra contraseña', async () => {
    const passwords = new PasswordService();
    const admin = await t.prisma.user.findUniqueOrThrow({
      where: { id: FIXTURE_USERS.admin.id },
    });

    expect(admin.passwordHash).toMatch(/^\$2b\$10\$/);
    expect(await passwords.compare(DEV_FIXTURE_PASSWORD, admin.passwordHash)).toBe(true);
    expect(await passwords.compare('otra-contraseña', admin.passwordHash)).toBe(false);
  });

  it('es idempotente: correrlo dos veces deja los mismos 5 usuarios', async () => {
    await seedDirectoryFixtures(t.prisma);

    const ids = users.map(([, user]) => user.id);
    expect(await t.prisma.user.count({ where: { id: { in: ids } } })).toBe(5);
  });
});
