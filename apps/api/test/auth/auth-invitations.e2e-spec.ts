/* Pruebas E2E de Invitaciones y Registro Público (HU29 / M4.3)
 * Verifica el ciclo de vida completo, persistencia en PostgreSQL,
 * control de tasa en Redis y concurrencia real CAS.
 */

import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AuthRateLimiterService,
  INVITATION_VALIDATION_IP_MAX_ATTEMPTS,
  REGISTRATION_BLOCK_WINDOW_SECONDS,
  REGISTRATION_IP_MAX_ATTEMPTS,
  REGISTRATION_TOKEN_MAX_ATTEMPTS,
} from '../../src/auth/auth-rate-limiter.service';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from '../../src/auth/auth.controller';
import {
  generateInvitationToken,
  hashInvitationToken,
} from '../../src/auth/token.utils';
import {
  AuthTestApp,
  AuthTestSandbox,
  LOOPBACK_IPS,
  SeededAuthUser,
  createAuthTestApp,
  extractRefreshTokenCookieValue,
  findCookieHeader,
  signTestJwt,
} from './helpers';

class InvitationsE2eSandbox extends AuthTestSandbox {
  private readonly invitationIds = new Set<string>();
  private readonly trackedTokens = new Set<string>();
  private readonly trackedCustomIps = new Set<string>();
  private readonly trackedEmails = new Set<string>();
  private readonly creatorUserIds = new Set<string>();

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly redisClient: Redis,
    private readonly authRateLimiter: AuthRateLimiterService,
  ) {
    super(prismaClient, redisClient, authRateLimiter);
  }

  override async createUser(
    opts?: Parameters<AuthTestSandbox['createUser']>[0],
  ): Promise<SeededAuthUser> {
    const user = await super.createUser(opts);
    this.creatorUserIds.add(user.id);
    return user;
  }

  trackInvitation(id: string): string {
    this.invitationIds.add(id);
    return id;
  }

  trackToken(token: string): string {
    this.trackedTokens.add(token);
    return token;
  }

  override trackEmail(email: string): string {
    super.trackEmail(email);
    this.trackedEmails.add(email.trim().toLowerCase());
    return email;
  }

  override trackIp(ip: string): string {
    super.trackIp(ip);
    this.trackedCustomIps.add(ip.trim());
    return ip;
  }

  override async cleanRedisKeys(): Promise<void> {
    await super.cleanRedisKeys();
    const ips = new Set<string>([...LOOPBACK_IPS, ...this.trackedCustomIps]);
    const keysToDelete: string[] = [];

    for (const ip of ips) {
      keysToDelete.push(this.authRateLimiter.getInvitationValidationIpKey(ip));
      keysToDelete.push(this.authRateLimiter.getRegistrationIpKey(ip));
    }

    for (const token of this.trackedTokens) {
      keysToDelete.push(this.authRateLimiter.getRegistrationTokenKey(token));
    }

    if (keysToDelete.length > 0) {
      await this.redisClient.del(...keysToDelete);
    }
  }

  override async cleanup(): Promise<void> {
    await this.cleanRedisKeys();

    const trackedInvs = [...this.invitationIds];
    const trackedEmails = [...this.trackedEmails];
    const trackedCreators = [...this.creatorUserIds];

    // 1. Eliminar sesiones de usuarios registrados
    if (trackedEmails.length > 0) {
      await this.prismaClient.session.deleteMany({
        where: {
          user: { email: { in: trackedEmails } },
        },
      });

      // 2. Eliminar áreas de usuarios registrados
      await this.prismaClient.userArea.deleteMany({
        where: {
          user: { email: { in: trackedEmails } },
        },
      });
    }

    // 3. Eliminar áreas de invitación mediante identificadores específicos rastreados
    const invAreaFilters: Array<{
      invitationId?: { in: string[] };
      invitation?: { email?: { in: string[] }; createdById?: { in: string[] } };
    }> = [];
    if (trackedInvs.length > 0) {
      invAreaFilters.push({ invitationId: { in: trackedInvs } });
    }
    if (trackedEmails.length > 0) {
      invAreaFilters.push({ invitation: { email: { in: trackedEmails } } });
    }
    if (trackedCreators.length > 0) {
      invAreaFilters.push({ invitation: { createdById: { in: trackedCreators } } });
    }
    if (invAreaFilters.length > 0) {
      await this.prismaClient.userInvitationArea.deleteMany({
        where: {
          OR: invAreaFilters,
        },
      });
    }

    // 4. Eliminar invitaciones mediante identificadores específicos rastreados
    const invFilters: Array<{
      id?: { in: string[] };
      email?: { in: string[] };
      createdById?: { in: string[] };
    }> = [];
    if (trackedInvs.length > 0) {
      invFilters.push({ id: { in: trackedInvs } });
    }
    if (trackedEmails.length > 0) {
      invFilters.push({ email: { in: trackedEmails } });
    }
    if (trackedCreators.length > 0) {
      invFilters.push({ createdById: { in: trackedCreators } });
    }
    if (invFilters.length > 0) {
      await this.prismaClient.userInvitation.deleteMany({
        where: {
          OR: invFilters,
        },
      });
    }

    // 5. Eliminar usuarios registrados mediante invitación
    if (trackedEmails.length > 0) {
      await this.prismaClient.user.deleteMany({
        where: {
          email: { in: trackedEmails },
        },
      });
    }

    this.invitationIds.clear();
    this.trackedTokens.clear();
    this.trackedCustomIps.clear();
    this.trackedEmails.clear();
    this.creatorUserIds.clear();

    await super.cleanup();
  }
}

describe('Invitaciones y Registro de Usuarios - HU29 (E2E)', () => {
  let t: AuthTestApp;
  let sandbox: InvitationsE2eSandbox;

  beforeAll(async () => {
    t = await createAuthTestApp();
    sandbox = new InvitationsE2eSandbox(t.prisma, t.redis, t.rateLimiter);
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

  describe('Flujo completo de invitación y registro (Happy Path)', () => {
    it('permite a un ADMIN invitar a un usuario, validarlo públicamente y registrarlo con sesión y áreas en PostgreSQL real', async () => {
      // 1. Crear ADMIN y un Área activa en PostgreSQL
      const admin = await sandbox.createUser({
        name: 'Administrador E2E',
        role: 'ADMIN',
      });
      const area = await sandbox.createArea({
        name: 'Operaciones Especiales',
        isActive: true,
      });

      // 2. Login como ADMIN para obtener token de autorización
      const loginRes = await http()
        .post('/api/auth/login')
        .send({
          email: admin.email,
          password: admin.password,
        })
        .expect(200);

      const adminAccessToken = loginRes.body.accessToken as string;

      // 3. Crear invitación vía POST /api/users/invitations
      const targetEmail = sandbox.trackEmail(`nuevo.empleado.${randomUUID().slice(0, 8)}@empresa.com`);
      const inviteRes = await http()
        .post('/api/users/invitations')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: targetEmail,
          role: 'EMPLOYEE',
          areaIds: [area.id],
        })
        .expect(201);

      expect(inviteRes.body.id).toBeDefined();
      expect(inviteRes.body.email).toBe(targetEmail.toLowerCase());
      expect(inviteRes.body.role).toBe('EMPLOYEE');
      expect(inviteRes.body.invitationUrl).toBeDefined();

      sandbox.trackInvitation(inviteRes.body.id);

      // Extraer el raw token del invitationUrl devuelto por el adaptador local
      const invitationUrl = inviteRes.body.invitationUrl as string;
      const rawToken = invitationUrl.split('#token=')[1];
      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(43);
      sandbox.trackToken(rawToken);

      // 4. Validar token públicamente vía POST /api/auth/invitations/validate (sin auth)
      const valRes = await http()
        .post('/api/auth/invitations/validate')
        .send({ token: rawToken })
        .expect(200);

      expect(valRes.body).toEqual({
        valid: true,
        email: targetEmail.toLowerCase(),
        role: 'EMPLOYEE',
      });

      // 5. Registrar al nuevo usuario vía POST /api/auth/register (sin auth)
      const newPassword = 'PasswordE2ESeguro2026!';
      const regRes = await http()
        .post('/api/auth/register')
        .set('User-Agent', 'E2E-RegisterAgent/1.0')
        .send({
          token: rawToken,
          name: 'Elena Empleada E2E',
          password: newPassword,
        })
        .expect(201);

      // Verificar respuesta de registro
      expect(regRes.body.accessToken).toBeDefined();
      expect(regRes.body.user).toEqual({
        id: expect.any(String),
        name: 'Elena Empleada E2E',
        email: targetEmail.toLowerCase(),
        role: 'EMPLOYEE',
      });
      // El refresh token no debe estar en el JSON
      expect(regRes.body).not.toHaveProperty('refreshToken');

      // Verificar cookie httpOnly
      const cookieHeader = findCookieHeader(regRes, REFRESH_TOKEN_COOKIE_NAME);
      expect(cookieHeader).toBeDefined();
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain(`Path=${REFRESH_TOKEN_COOKIE_PATH}`);

      const refreshTokenValue = extractRefreshTokenCookieValue(regRes);
      expect(refreshTokenValue.length).toBeGreaterThan(20);

      // 6. Verificar persistencia física en PostgreSQL
      const createdUser = await t.prisma.user.findUnique({
        where: { email: targetEmail.toLowerCase() },
        include: { areas: true },
      });
      expect(createdUser).not.toBeNull();
      expect(createdUser!.name).toBe('Elena Empleada E2E');
      expect(createdUser!.role).toBe('EMPLOYEE');
      expect(createdUser!.isActive).toBe(true);
      expect(createdUser!.areas).toHaveLength(1);
      expect(createdUser!.areas[0].areaId).toBe(area.id);

      // Verificar que la invitación fue marcada como consumida en DB
      const consumedInvitation = await t.prisma.userInvitation.findUnique({
        where: { tokenHash: hashInvitationToken(rawToken) },
      });
      expect(consumedInvitation).not.toBeNull();
      expect(consumedInvitation!.acceptedAt).not.toBeNull();

      // 7. Iniciar sesión con las nuevas credenciales creadas vía POST /api/auth/login
      const newLoginRes = await http()
        .post('/api/auth/login')
        .send({
          email: targetEmail.toLowerCase(),
          password: newPassword,
        })
        .expect(200);

      expect(newLoginRes.body.user.email).toBe(targetEmail.toLowerCase());
      expect(newLoginRes.body.accessToken).toBeDefined();
    });
  });

  describe('Concurrencia real CAS a nivel PostgreSQL', () => {
    it('ante dos solicitudes simultáneas con el mismo token en PostgreSQL, una gana (201) y la otra es rechazada de forma segura (409/410)', async () => {
      // 1. Crear ADMIN y Área
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const area = await sandbox.createArea();

      // 2. Crear invitación directa en DB
      const targetEmail = sandbox.trackEmail(`concurrent.${randomUUID().slice(0, 8)}@empresa.com`);
      const adminToken = signTestJwt({ sub: admin.id, role: admin.role, email: admin.email });

      const inviteRes = await http()
        .post('/api/users/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: targetEmail,
          role: 'EMPLOYEE',
          areaIds: [area.id],
        })
        .expect(201);

      sandbox.trackInvitation(inviteRes.body.id);
      const rawToken = (inviteRes.body.invitationUrl as string).split('#token=')[1];
      sandbox.trackToken(rawToken);

      // 3. Ejecutar dos solicitudes HTTP concurrentes exactamente con el mismo token
      const req1 = http()
        .post('/api/auth/register')
        .send({
          token: rawToken,
          name: 'Registro Concurrente 1',
          password: 'PasswordConcurrente1!',
        });

      const req2 = http()
        .post('/api/auth/register')
        .send({
          token: rawToken,
          name: 'Registro Concurrente 2',
          password: 'PasswordConcurrente2!',
        });

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort((a, b) => a - b);

      // Exactamente una gana (201) y la perdedora falla de forma segura con 409 Conflict o 410 Gone
      expect(statuses[0]).toBe(201);
      expect([409, 410]).toContain(statuses[1]);

      const winner = res1.status === 201 ? res1 : res2;
      const loser = res1.status !== 201 ? res1 : res2;

      expect(winner.body.user.email).toBe(targetEmail.toLowerCase());
      if (loser.status === 409) {
        expect(loser.body.error).toBe('Conflict');
        expect(loser.body.message).toContain('ya fue consumida por otra solicitud concurrente');
      } else {
        expect(loser.body.error).toBe('Gone');
        expect(loser.body.message).toContain('ya fue utilizada');
      }

      // Verificar en PostgreSQL que solo existe un usuario registrado
      const usersInDb = await t.prisma.user.findMany({
        where: { email: targetEmail.toLowerCase() },
      });
      expect(usersInDb).toHaveLength(1);

      // Verificar en PostgreSQL que la invitación fue consumida exactamente una sola vez
      const consumedInvitation = await t.prisma.userInvitation.findUnique({
        where: { id: inviteRes.body.id },
      });
      expect(consumedInvitation).not.toBeNull();
      expect(consumedInvitation!.acceptedAt).not.toBeNull();
    });
  });

  describe('Tokens expirados, revocados o ya consumidos', () => {
    it('responde 410 Gone al validar o registrar con una invitación ya consumida', async () => {
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const area = await sandbox.createArea();
      const adminToken = signTestJwt({ sub: admin.id, role: admin.role, email: admin.email });
      const targetEmail = sandbox.trackEmail(`used.${randomUUID().slice(0, 8)}@empresa.com`);

      const inviteRes = await http()
        .post('/api/users/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: targetEmail, role: 'EMPLOYEE', areaIds: [area.id] })
        .expect(201);

      sandbox.trackInvitation(inviteRes.body.id);
      const rawToken = (inviteRes.body.invitationUrl as string).split('#token=')[1];
      sandbox.trackToken(rawToken);

      // Primer consumo exitoso
      await http()
        .post('/api/auth/register')
        .send({
          token: rawToken,
          name: 'Usuario Consumido',
          password: 'PasswordSeguro123!',
        })
        .expect(201);

      // Intento posterior de validación: 410 Gone
      const valRes = await http()
        .post('/api/auth/invitations/validate')
        .send({ token: rawToken })
        .expect(410);

      expect(valRes.body.message).toContain('ya fue utilizada');

      // Intento posterior de registro: 410 Gone
      const regRes = await http()
        .post('/api/auth/register')
        .send({
          token: rawToken,
          name: 'Usuario Reconsumo',
          password: 'PasswordSeguro123!',
        })
        .expect(410);

      expect(regRes.body.message).toContain('ya fue utilizada');
    });

    it('responde 410 Gone si la invitación fue revocada', async () => {
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const area = await sandbox.createArea();
      const adminToken = signTestJwt({ sub: admin.id, role: admin.role, email: admin.email });
      const targetEmail = sandbox.trackEmail(`revoked.${randomUUID().slice(0, 8)}@empresa.com`);

      const inviteRes = await http()
        .post('/api/users/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: targetEmail, role: 'EMPLOYEE', areaIds: [area.id] })
        .expect(201);

      const invId = inviteRes.body.id;
      sandbox.trackInvitation(invId);
      const rawToken = (inviteRes.body.invitationUrl as string).split('#token=')[1];
      sandbox.trackToken(rawToken);

      // Revocar explícitamente en PostgreSQL
      await t.prisma.userInvitation.update({
        where: { id: invId },
        data: { revokedAt: new Date() },
      });

      // Validación: 410
      await http()
        .post('/api/auth/invitations/validate')
        .send({ token: rawToken })
        .expect(410);

      // Registro: 410
      await http()
        .post('/api/auth/register')
        .send({
          token: rawToken,
          name: 'Usuario Revocado',
          password: 'PasswordValido123!',
        })
        .expect(410);
    });

    it('responde 410 Gone si la invitación expiró', async () => {
      const admin = await sandbox.createUser({ role: 'ADMIN' });
      const area = await sandbox.createArea();
      const adminToken = signTestJwt({ sub: admin.id, role: admin.role, email: admin.email });
      const targetEmail = sandbox.trackEmail(`expired.${randomUUID().slice(0, 8)}@empresa.com`);

      const inviteRes = await http()
        .post('/api/users/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: targetEmail, role: 'EMPLOYEE', areaIds: [area.id] })
        .expect(201);

      const invId = inviteRes.body.id;
      sandbox.trackInvitation(invId);
      const rawToken = (inviteRes.body.invitationUrl as string).split('#token=')[1];
      sandbox.trackToken(rawToken);

      // Expirar en PostgreSQL fijando fecha en el pasado
      await t.prisma.userInvitation.update({
        where: { id: invId },
        data: { expiresAt: new Date(Date.now() - 3600000) },
      });

      // Validación: 410
      await http()
        .post('/api/auth/invitations/validate')
        .send({ token: rawToken })
        .expect(410);

      // Registro: 410
      await http()
        .post('/api/auth/register')
        .send({
          token: rawToken,
          name: 'Usuario Expirado',
          password: 'PasswordValido123!',
        })
        .expect(410);
    });
  });

  describe('Protección de tasa en Redis (Rate Limiting)', () => {
    it('bloquea con HTTP 429 tras 5 intentos fallidos con el mismo token en registro y nunca almacena el token plano en Redis', async () => {
      const fakeToken = generateInvitationToken();
      sandbox.trackToken(fakeToken);

      // Realizar 5 intentos fallidos con este token (token inexistente -> 404)
      for (let i = 0; i < REGISTRATION_TOKEN_MAX_ATTEMPTS; i++) {
        await http()
          .post('/api/auth/register')
          .send({
            token: fakeToken,
            name: `Intento Fallido ${i}`,
            password: 'PasswordValido123!',
          })
          .expect(404);
      }

      // El 6.º intento debe ser bloqueado por INVITATION_TOKEN con HTTP 429
      const blockedRes = await http()
        .post('/api/auth/register')
        .send({
          token: fakeToken,
          name: 'Intento Bloqueado',
          password: 'PasswordValido123!',
        })
        .expect(429);

      expect(blockedRes.body.limitType).toBe('INVITATION_TOKEN');

      // Comprobar que en Redis la clave contiene el hash SHA-256 y no el token plano
      const tokenHashKey = t.rateLimiter.getRegistrationTokenKey(fakeToken);
      expect(tokenHashKey).not.toContain(fakeToken);
      const count = await t.redis.get(tokenHashKey);
      expect(Number(count)).toBeGreaterThanOrEqual(REGISTRATION_TOKEN_MAX_ATTEMPTS);
    });

    it('bloquea con HTTP 429 (REGISTRATION_IP) al alcanzar el umbral de intentos de registro por IP', async () => {
      // Pre-sembramos el umbral en las IPs loopback de prueba
      for (const ip of LOOPBACK_IPS) {
        await t.redis.set(
          t.rateLimiter.getRegistrationIpKey(ip),
          String(REGISTRATION_IP_MAX_ATTEMPTS),
          'EX',
          REGISTRATION_BLOCK_WINDOW_SECONDS,
        );
      }

      const testToken = generateInvitationToken();
      sandbox.trackToken(testToken);

      const blockedRes = await http()
        .post('/api/auth/register')
        .send({
          token: testToken,
          name: 'Intento Bloqueado IP',
          password: 'PasswordValido123!',
        })
        .expect(429);

      expect(blockedRes.body.limitType).toBe('REGISTRATION_IP');
      expect(blockedRes.body.message).toContain('Demasiados intentos de registro desde esta dirección IP');
    });

    it('bloquea con HTTP 429 (INVITATION_VALIDATION_IP) tras alcanzar el umbral de consultas de validación desde la misma IP', async () => {
      // Pre-sembramos el umbral en las IPs loopback de prueba
      for (const ip of LOOPBACK_IPS) {
        await t.redis.set(
          t.rateLimiter.getInvitationValidationIpKey(ip),
          String(INVITATION_VALIDATION_IP_MAX_ATTEMPTS),
          'EX',
          REGISTRATION_BLOCK_WINDOW_SECONDS,
        );
      }

      const testToken = generateInvitationToken();
      sandbox.trackToken(testToken);

      const blockedRes = await http()
        .post('/api/auth/invitations/validate')
        .send({ token: testToken })
        .expect(429);

      expect(blockedRes.body.limitType).toBe('INVITATION_VALIDATION_IP');
      expect(blockedRes.body.message).toContain('Demasiadas consultas de validación');
    });

    it('aplica política Fail-Closed (HTTP 503) en validación y registro si Redis tiene contadores corruptos', async () => {
      // Corromper contadores en las IPs loopback
      for (const ip of LOOPBACK_IPS) {
        await t.redis.set(
          t.rateLimiter.getInvitationValidationIpKey(ip),
          'contador-corrupto',
          'EX',
          60,
        );
        await t.redis.set(
          t.rateLimiter.getRegistrationIpKey(ip),
          'contador-corrupto',
          'EX',
          60,
        );
      }

      const testToken = generateInvitationToken();
      sandbox.trackToken(testToken);

      const valRes = await http()
        .post('/api/auth/invitations/validate')
        .send({ token: testToken })
        .expect(503);

      expect(valRes.body.error).toBe('Service Unavailable');
      expect(valRes.body.message).toContain('Servicio de autenticación no disponible');

      const regRes = await http()
        .post('/api/auth/register')
        .send({
          token: testToken,
          name: 'Registro Fail Closed',
          password: 'PasswordValido123!',
        })
        .expect(503);

      expect(regRes.body.error).toBe('Service Unavailable');
      expect(regRes.body.message).toContain('Servicio de autenticación no disponible');
    });
  });
});
