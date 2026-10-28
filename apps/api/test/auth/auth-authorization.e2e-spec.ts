/* Pruebas E2E de autorización: JwtAuthGuard, RolesGuard, @CurrentUser, @Public y AccessService contra PostgreSQL real */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  AccessService,
  type AuthUser,
  CurrentUser,
  JwtAuthGuard,
  Public,
  Roles,
  RolesGuard,
} from '../../src/common/auth';
import {
  AuthTestApp,
  AuthTestSandbox,
  createAuthTestApp,
  signTestJwt,
} from './helpers';

class CheckAreaAccessBody {
  areaIds!: string[];
}

@Controller('test-authz')
@UseGuards(JwtAuthGuard, RolesGuard)
class TestAuthzProbeController {
  constructor(private readonly accessService: AccessService) {}

  @Public()
  @Get('public')
  getPublic(): { ok: boolean } {
    return { ok: true };
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get('admin-only')
  @Roles('ADMIN')
  getAdminOnly(@CurrentUser() user: AuthUser): { role: string } {
    return { role: user.role };
  }

  @Get('supervisor-or-admin')
  @Roles('ADMIN', 'SUPERVISOR')
  getSupervisorOrAdmin(@CurrentUser() user: AuthUser): { role: string } {
    return { role: user.role };
  }

  @Post('area-access')
  @HttpCode(HttpStatus.OK)
  async checkAreaAccess(
    @CurrentUser() user: AuthUser,
    @Body() body: CheckAreaAccessBody,
  ): Promise<{ allowed: boolean }> {
    await this.accessService.assertAreaAccess(user, body.areaIds);
    return { allowed: true };
  }
}

describe('Authorization: Guards, Roles & AccessService (E2E)', () => {
  let t: AuthTestApp;
  let sandbox: AuthTestSandbox;

  beforeAll(async () => {
    t = await createAuthTestApp([TestAuthzProbeController]);
    sandbox = new AuthTestSandbox(t.prisma, t.redis, t.rateLimiter);
  });

  afterAll(async () => {
    await sandbox.cleanup();
    await t.app.close();
  });

  beforeEach(async () => {
    await sandbox.cleanup();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  const http = () => request(t.app.getHttpServer());

  describe('JwtAuthGuard y eliminación del guard simulado', () => {
    it('permite acceso sin token a rutas decoradas con @Public() dentro de un controlador protegido', async () => {
      const res = await http().get('/api/test-authz/public').expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('rechaza con 401 peticiones sin Bearer token, con cabeceras legadas x-user-id/x-user-role, con firma inválida, expiradas o con sub inválido', async () => {
      const adminUser = await sandbox.createUser({ role: 'ADMIN' });

      // 1. Sin cabeceras de autenticación en endpoint real (/api/documents)
      await http().get('/api/documents').expect(401);

      // 2. Sólo con cabeceras simuladas legadas x-user-id y x-user-role
      await http()
        .get('/api/documents')
        .set({
          'x-user-id': adminUser.id,
          'x-user-role': 'ADMIN',
        })
        .expect(401);

      // 3. Token firmado con otro secreto
      const wrongSecretToken = signTestJwt(
        { sub: adminUser.id, role: 'ADMIN' },
        { secret: 'otro-secreto-invalido' },
      );
      await http()
        .get('/api/documents')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .expect(401);

      // 4. Token expirado
      const expiredToken = signTestJwt(
        { sub: adminUser.id, role: 'ADMIN' },
        { expiresIn: -10 },
      );
      await http()
        .get('/api/documents')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      // 5. Token con firma válida pero sub que no es UUID
      const nonUuidSubToken = signTestJwt({
        sub: 'no-es-uuid',
        role: 'ADMIN',
      });
      await http()
        .get('/api/documents')
        .set('Authorization', `Bearer ${nonUuidSubToken}`)
        .expect(401);

      // 6. Token con UUID inexistente en PostgreSQL
      const deletedUserToken = signTestJwt({
        sub: randomUUID(),
        role: 'ADMIN',
      });
      await http()
        .get('/api/documents')
        .set('Authorization', `Bearer ${deletedUserToken}`)
        .expect(401);
    });

    it('resuelve @CurrentUser() desde PostgreSQL filtrando áreas inactivas y rechaza con 401 apenas el usuario se desactiva en BD', async () => {
      const activeArea = await sandbox.createArea({ isActive: true });
      const inactiveArea = await sandbox.createArea({ isActive: false });
      const user = await sandbox.createUser({
        name: 'Lucía Supervisora',
        role: 'SUPERVISOR',
        areaIds: [activeArea.id, inactiveArea.id],
      });

      const loginRes = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const accessToken = (loginRes.body as { accessToken: string }).accessToken;

      const meRes = await http()
        .get('/api/test-authz/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body).toEqual({
        id: user.id,
        email: user.email,
        name: 'Lucía Supervisora',
        role: 'SUPERVISOR',
        areaIds: [activeArea.id],
      });

      // Si el usuario se desactiva en PostgreSQL, el mismo JWT vigente debe ser rechazado con 401
      await t.prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      await http()
        .get('/api/test-authz/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      await http()
        .get('/api/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('RolesGuard con estado vivo en PostgreSQL', () => {
    it('evalúa el rol vigente en PostgreSQL (ignorando el claim role del JWT) y aplica 403 cuando el rol no está autorizado', async () => {
      const user = await sandbox.createUser({ role: 'EMPLOYEE' });

      const loginRes = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const employeeToken = (loginRes.body as { accessToken: string })
        .accessToken;

      // Como EMPLOYEE recibe 403 en rutas para ADMIN o SUPERVISOR
      await http()
        .get('/api/test-authz/admin-only')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);

      await http()
        .get('/api/test-authz/supervisor-or-admin')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);

      // Promoción en PostgreSQL a SUPERVISOR sin re-emitir el JWT:
      await t.prisma.user.update({
        where: { id: user.id },
        data: { role: 'SUPERVISOR' },
      });

      await http()
        .get('/api/test-authz/supervisor-or-admin')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200)
        .expect({ role: 'SUPERVISOR' });

      await http()
        .get('/api/test-authz/admin-only')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);

      // Promoción en PostgreSQL a ADMIN sin re-emitir el JWT:
      await t.prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });

      await http()
        .get('/api/test-authz/admin-only')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200)
        .expect({ role: 'ADMIN' });
    });
  });

  describe('AccessService.assertAreaAccess contra PostgreSQL real', () => {
    it('concede acceso a ADMIN en áreas activas (sin requerir user_areas) y a no-ADMIN si posee al menos un área activa del recurso (some)', async () => {
      const areaA = await sandbox.createArea({ isActive: true });
      const areaB = await sandbox.createArea({ isActive: true });

      const admin = await sandbox.createUser({
        role: 'ADMIN',
        areaIds: [],
      });
      const employeeA = await sandbox.createUser({
        role: 'EMPLOYEE',
        areaIds: [areaA.id],
      });

      const adminToken = signTestJwt({ sub: admin.id, role: 'ADMIN' });
      const empToken = signTestJwt({ sub: employeeA.id, role: 'EMPLOYEE' });

      // ADMIN accede a ambas áreas activas sin tener filas en user_areas
      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaIds: [areaA.id, areaB.id] })
        .expect(200)
        .expect({ allowed: true });

      // EMPLOYEE con areaA accede a un recurso asociado a [areaA, areaB] (regla some)
      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ areaIds: [areaA.id, areaB.id] })
        .expect(200)
        .expect({ allowed: true });

      // EMPLOYEE con solo areaA recibe 404 al intentar acceder a un recurso exclusivo de areaB
      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ areaIds: [areaB.id] })
        .expect(404);
    });

    it('responde 404 si alguna de las áreas solicitadas no existe o está inactiva en PostgreSQL (incluso para ADMIN) o si se desactiva el área asignada al usuario', async () => {
      const activeArea = await sandbox.createArea({ isActive: true });
      const inactiveArea = await sandbox.createArea({ isActive: false });

      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const supervisor = await sandbox.createUser({
        role: 'SUPERVISOR',
        areaIds: [activeArea.id],
      });

      const adminToken = signTestJwt({ sub: admin.id, role: 'ADMIN' });
      const supToken = signTestJwt({
        sub: supervisor.id,
        role: 'SUPERVISOR',
      });

      // Área inexistente -> 404 incluso para ADMIN
      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaIds: [randomUUID()] })
        .expect(404);

      // Área inactiva en el recurso -> 404 incluso para ADMIN
      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaIds: [activeArea.id, inactiveArea.id] })
        .expect(404);

      // Supervisor accede mientras activeArea está activa
      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ areaIds: [activeArea.id] })
        .expect(200);

      // Al desactivar activeArea en PostgreSQL, el acceso se revoca inmediatamente (404)
      await t.prisma.area.update({
        where: { id: activeArea.id },
        data: { isActive: false },
      });

      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ areaIds: [activeArea.id] })
        .expect(404);
    });

    it('responde 400 cuando areaIds está vacío o contiene un identificador que no es UUID válido', async () => {
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const adminToken = signTestJwt({ sub: admin.id, role: 'ADMIN' });

      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaIds: [] })
        .expect(400);

      await http()
        .post('/api/test-authz/area-access')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaIds: ['no-es-uuid'] })
        .expect(400);
    });
  });
});
