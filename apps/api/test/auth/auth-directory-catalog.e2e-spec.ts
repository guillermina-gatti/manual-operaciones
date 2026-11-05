/* A-15: contratos HTTP de áreas y candidatos, con JwtAuthGuard, RolesGuard y PostgreSQL reales. */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  AuthTestApp,
  AuthTestSandbox,
  createAuthTestApp,
  signTestJwt,
} from './helpers';

describe('A-15: catálogos de áreas y candidatos (E2E)', () => {
  let t: AuthTestApp;
  let sandbox: AuthTestSandbox;

  beforeAll(async () => {
    t = await createAuthTestApp();
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
  const bearer = (id: string, claimedRole: string) => ({
    Authorization: `Bearer ${signTestJwt({ sub: id, role: claimedRole })}`,
  });

  describe('GET /api/areas', () => {
    it('devuelve áreas activas e inactivas ordenadas con un DTO público estricto para los tres roles', async () => {
      const zeta = await sandbox.createArea({ name: 'Zeta A15', isActive: true });
      const alfa = await sandbox.createArea({ name: 'Alfa A15', isActive: false });
      const beta = await sandbox.createArea({ name: 'Beta A15', isActive: true });

      const expected = [
        { id: alfa.id, name: alfa.name, isActive: false },
        { id: beta.id, name: beta.name, isActive: true },
        { id: zeta.id, name: zeta.name, isActive: true },
      ];

      for (const role of ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const) {
        const user = await sandbox.createUser({ role });
        const res = await http()
          .get('/api/areas')
          .set(bearer(user.id, role))
          .expect(200);
        expect(res.body).toEqual(expected);
      }
    });

    it('devuelve 200 con lista vacía cuando no existen áreas', async () => {
      const user = await sandbox.createUser({ role: 'EMPLOYEE' });
      await http()
        .get('/api/areas')
        .set(bearer(user.id, user.role))
        .expect(200)
        .expect([]);
    });

    it('rechaza accesos anónimos, cabeceras simuladas y JWT inválidos con 401', async () => {
      const user = await sandbox.createUser({ role: 'ADMIN' });

      await http().get('/api/areas').expect(401);
      await http()
        .get('/api/areas')
        .set({ 'x-user-id': user.id, 'x-user-role': 'ADMIN' })
        .expect(401);
      await http()
        .get('/api/areas')
        .set('Authorization', 'Bearer token-invalido')
        .expect(401);
    });

    it('rechaza filtros no admitidos y deja de atender al usuario desactivado', async () => {
      const user = await sandbox.createUser({ role: 'ADMIN' });
      const auth = bearer(user.id, user.role);

      await http().get('/api/areas?includeInactive=true').set(auth).expect(400);
      await http().get('/api/areas').set(auth).expect(200);

      await t.prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
      await http().get('/api/areas').set(auth).expect(401);
    });
  });

  describe('GET /api/users?areaIds=...', () => {
    it('devuelve solo candidatos activos de las áreas indicadas y ADMIN globales; no filtra datos privados', async () => {
      const ventas = await sandbox.createArea({ name: 'Ventas A15' });
      const compras = await sandbox.createArea({ name: 'Compras A15' });

      const admin = await sandbox.createUser({ name: 'Ana Admin A15', role: 'ADMIN' });
      const empleado = await sandbox.createUser({
        name: 'Bruno Empleado A15', role: 'EMPLOYEE', areaIds: [ventas.id],
      });
      const supervisora = await sandbox.createUser({
        name: 'Carla Supervisora A15', role: 'SUPERVISOR', areaIds: [ventas.id],
      });
      await sandbox.createUser({
        name: 'Diego Otra Area A15', role: 'EMPLOYEE', areaIds: [compras.id],
      });
      await sandbox.createUser({
        name: 'Eva Inactiva A15', role: 'EMPLOYEE', isActive: false, areaIds: [ventas.id],
      });
      await sandbox.createUser({
        name: 'Fiona Admin Inactiva A15', role: 'ADMIN', isActive: false,
      });

      const res = await http()
        .get(`/api/users?areaIds=${ventas.id}`)
        .set(bearer(admin.id, admin.role))
        .expect(200);

      // La igualdad exacta verifica orden, roles y que no se filtren email, hash, isActive ni relaciones.
      expect(res.body).toEqual([
        { id: admin.id, name: admin.name, role: 'ADMIN' },
        { id: empleado.id, name: empleado.name, role: 'EMPLOYEE' },
        { id: supervisora.id, name: supervisora.name, role: 'SUPERVISOR' },
      ]);
    });

    it('acepta varias áreas con parámetros repetidos y deduplica UUIDs', async () => {
      const ventas = await sandbox.createArea({ name: 'Ventas A15' });
      const compras = await sandbox.createArea({ name: 'Compras A15' });
      const admin = await sandbox.createUser({ name: 'Ana A15', role: 'ADMIN' });
      const empleadoVentas = await sandbox.createUser({
        name: 'Beto A15', role: 'EMPLOYEE', areaIds: [ventas.id],
      });
      const empleadaCompras = await sandbox.createUser({
        name: 'Ceci A15', role: 'EMPLOYEE', areaIds: [compras.id],
      });
      const supervisoraAmbas = await sandbox.createUser({
        name: 'Dani A15', role: 'SUPERVISOR', areaIds: [ventas.id, compras.id],
      });

      const res = await http()
        .get(`/api/users?areaIds=${ventas.id}&areaIds=${compras.id}&areaIds=${ventas.id}`)
        .set(bearer(admin.id, admin.role))
        .expect(200);

      expect(res.body).toEqual([
        { id: admin.id, name: admin.name, role: 'ADMIN' },
        { id: empleadoVentas.id, name: empleadoVentas.name, role: 'EMPLOYEE' },
        { id: empleadaCompras.id, name: empleadaCompras.name, role: 'EMPLOYEE' },
        { id: supervisoraAmbas.id, name: supervisoraAmbas.name, role: 'SUPERVISOR' },
      ]);
    });

    it('rechaza parámetros mal formados, filtros extras y áreas inexistentes o inactivas (400)', async () => {
      const activa = await sandbox.createArea({ name: 'Activa A15', isActive: true });
      const inactiva = await sandbox.createArea({ name: 'Inactiva A15', isActive: false });
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const auth = bearer(admin.id, admin.role);

      const invalidQueries = [
        '',
        '?areaIds=',
        '?areaIds=no-es-uuid',
        `?areaIds=${activa.id},${inactiva.id}`,
        `?areaIds=${activa.id}&includeInactive=true`,
        `?areaIds[0]=${activa.id}`,
        `?areaIds=${randomUUID()}`,
        `?areaIds=${activa.id}&areaIds=${randomUUID()}`,
        `?areaIds=${inactiva.id}`,
        `?areaIds=${activa.id}&areaIds=${inactiva.id}`,
      ];

      for (const query of invalidQueries) {
        await http().get(`/api/users${query}`).set(auth).expect(400);
      }
    });

    it('exige JWT real y rol ADMIN; rechaza SUPERVISOR y EMPLOYEE con 403', async () => {
      const area = await sandbox.createArea({ name: 'Ventas A15' });
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const supervisor = await sandbox.createUser({ role: 'SUPERVISOR', areaIds: [area.id] });
      const employee = await sandbox.createUser({ role: 'EMPLOYEE', areaIds: [area.id] });
      const route = `/api/users?areaIds=${area.id}`;

      await http().get(route).expect(401);
      await http().get(route)
        .set({ 'x-user-id': admin.id, 'x-user-role': 'ADMIN' })
        .expect(401);
      await http().get(route).set(bearer(supervisor.id, supervisor.role)).expect(403);
      await http().get(route).set(bearer(employee.id, employee.role)).expect(403);
      await http().get(route).set(bearer(admin.id, admin.role)).expect(200);
    });

    it('aplica cambios de rol y desactivación de usuario desde PostgreSQL sin renovar el JWT', async () => {
      const area = await sandbox.createArea({ name: 'Ventas A15' });
      const user = await sandbox.createUser({ role: 'EMPLOYEE' });
      const tokenConRolViejo = bearer(user.id, 'EMPLOYEE');
      const route = `/api/users?areaIds=${area.id}`;

      await http().get(route).set(tokenConRolViejo).expect(403);

      await t.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      const res = await http().get(route).set(tokenConRolViejo).expect(200);
      expect(res.body).toEqual([{ id: user.id, name: user.name, role: 'ADMIN' }]);

      await t.prisma.user.update({ where: { id: user.id }, data: { role: 'SUPERVISOR' } });
      await http().get(route).set(tokenConRolViejo).expect(403);

      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await http().get(route).set(tokenConRolViejo).expect(401);
    });

    it('deja de ofrecer candidatos cuando se desactiva un área aunque el catálogo todavía la muestre', async () => {
      const area = await sandbox.createArea({ name: 'Area A15', isActive: true });
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const employee = await sandbox.createUser({
        name: 'Persona Area A15', role: 'EMPLOYEE', areaIds: [area.id],
      });
      const auth = bearer(admin.id, admin.role);
      const route = `/api/users?areaIds=${area.id}`;

      const antes = await http().get(route).set(auth).expect(200);
      expect(antes.body).toEqual([
        { id: admin.id, name: admin.name, role: 'ADMIN' },
        { id: employee.id, name: employee.name, role: 'EMPLOYEE' },
      ].sort((a, b) => a.name.localeCompare(b.name)));

      await t.prisma.area.update({ where: { id: area.id }, data: { isActive: false } });
      await http().get(route).set(auth).expect(400);

      const areasRes = await http().get('/api/areas').set(auth).expect(200);
      expect(areasRes.body).toEqual([
        { id: area.id, name: area.name, isActive: false },
      ]);
    });
  });
});
