/* Pruebas E2E de autenticación y ciclo de vida de sesiones: login, refresh, rotación, reutilización, carrera CAS y logout */

import request from 'supertest';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from '../../src/auth/auth.controller';
import { SESSION_TTL_MS } from '../../src/auth/session.service';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../src/auth/token.utils';
import {
  AUTH_E2E_PASSWORD,
  AuthTestApp,
  AuthTestSandbox,
  createAuthTestApp,
  extractRefreshTokenCookieValue,
  findCookieHeader,
} from './helpers';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Auth & Sessions (E2E)', () => {
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

  describe('POST /api/auth/login', () => {
    it('autentica credenciales válidas (200), devuelve accessToken + user, emite cookie HttpOnly y persiste el hash SHA-256 en PostgreSQL', async () => {
      const user = await sandbox.createUser({
        name: 'Camila Admin',
        role: 'ADMIN',
      });

      const res = await http()
        .post('/api/auth/login')
        .set('User-Agent', 'Playwright-E2E-Agent/1.0')
        .send({
          email: `  ${user.email.toUpperCase()}  `,
          password: user.password,
        })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'ADMIN',
        },
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const cookieHeader = findCookieHeader(res, REFRESH_TOKEN_COOKIE_NAME);
      expect(cookieHeader).toBeDefined();
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain(`Path=${REFRESH_TOKEN_COOKIE_PATH}`);
      expect(cookieHeader).toMatch(/SameSite=Lax/i);
      expect(cookieHeader).toContain(
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
      );
      if (process.env.NODE_ENV === 'production') {
        expect(cookieHeader).toMatch(/;\s*Secure/i);
      } else {
        expect(cookieHeader).not.toMatch(/;\s*Secure/i);
      }

      const rawRefreshToken = extractRefreshTokenCookieValue(res);
      const expectedTokenHash = hashRefreshToken(rawRefreshToken);

      const sessions = await t.prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(sessions).toHaveLength(1);
      const [persisted] = sessions;
      expect(persisted.tokenHash).toBe(expectedTokenHash);
      expect(persisted.tokenHash).not.toBe(rawRefreshToken);
      expect(persisted.isRevoked).toBe(false);
      expect(persisted.replacedById).toBeNull();
      expect(persisted.userAgent).toBe('Playwright-E2E-Agent/1.0');
      expect(persisted.ipAddress).toEqual(expect.any(String));
    });

    it('responde 401 con mensaje uniforme y no crea sesión ni cookie ante contraseña incorrecta, email inexistente o usuario inactivo', async () => {
      const activeUser = await sandbox.createUser({ role: 'EMPLOYEE' });
      const inactiveUser = await sandbox.createUser({
        role: 'EMPLOYEE',
        isActive: false,
      });
      const unknownEmail = sandbox.trackEmail(
        'inexistente-login@auth.test.invalid',
      );

      const wrongPassRes = await http()
        .post('/api/auth/login')
        .send({ email: activeUser.email, password: 'PasswordIncorrecta123!' })
        .expect(401);

      const unknownEmailRes = await http()
        .post('/api/auth/login')
        .send({ email: unknownEmail, password: AUTH_E2E_PASSWORD })
        .expect(401);

      const inactiveUserRes = await http()
        .post('/api/auth/login')
        .send({ email: inactiveUser.email, password: inactiveUser.password })
        .expect(401);

      for (const res of [wrongPassRes, unknownEmailRes, inactiveUserRes]) {
        expect(res.body).toEqual({
          statusCode: 401,
          message: 'Credenciales inválidas',
          error: 'Unauthorized',
        });
        expect(findCookieHeader(res, REFRESH_TOKEN_COOKIE_NAME)).toBeUndefined();
      }

      const sessionCount = await t.prisma.session.count({
        where: { userId: { in: [activeUser.id, inactiveUser.id] } },
      });
      expect(sessionCount).toBe(0);
    });

    it('responde 400 ante payloads inválidos o propiedades no permitidas por ValidationPipe', async () => {
      await http()
        .post('/api/auth/login')
        .send({ email: 'no-es-un-email', password: 'secret' })
        .expect(400);

      await http()
        .post('/api/auth/login')
        .send({ email: 'valido@auth.test.invalid', password: '' })
        .expect(400);

      await http()
        .post('/api/auth/login')
        .send({
          email: 'valido@auth.test.invalid',
          password: 'secret',
          role: 'ADMIN',
        })
        .expect(400);
    });
  });

  describe('POST /api/auth/refresh (rotación y validaciones)', () => {
    it('rota atómicamente la sesión (200), revoca la anterior con replacedById y emite nuevo accessToken y cookie refreshToken', async () => {
      const user = await sandbox.createUser({ role: 'SUPERVISOR' });

      const loginRes = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      const token1 = extractRefreshTokenCookieValue(loginRes);
      const hash1 = hashRefreshToken(token1);
      const session1Before = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hash1 },
      });

      const refreshRes = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${token1}`)
        .set('User-Agent', 'Rotated-Agent/2.0')
        .expect(200);

      expect(refreshRes.body).toEqual({
        accessToken: expect.any(String),
      });

      const token2 = extractRefreshTokenCookieValue(refreshRes);
      expect(token2).not.toBe(token1);

      const hash2 = hashRefreshToken(token2);
      const session2 = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hash2 },
      });
      const session1After = await t.prisma.session.findUniqueOrThrow({
        where: { id: session1Before.id },
      });

      expect(session1After.isRevoked).toBe(true);
      expect(session1After.replacedById).toBe(session2.id);
      expect(session2.isRevoked).toBe(false);
      expect(session2.replacedById).toBeNull();
      expect(session2.userId).toBe(user.id);
      expect(session2.userAgent).toBe('Rotated-Agent/2.0');
    });

    it('responde 401 opaco sin cookie, con formato inválido, con token inexistente o con sesión expirada', async () => {
      const user = await sandbox.createUser();
      const expiredRawToken = generateRefreshToken();
      await t.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: hashRefreshToken(expiredRawToken),
          expiresAt: new Date(Date.now() - 60_000),
          isRevoked: false,
        },
      });

      const noCookieRes = await http().post('/api/auth/refresh').expect(401);
      const malformedRes = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=token-malformado`)
        .expect(401);
      const unknownTokenRes = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${generateRefreshToken()}`)
        .expect(401);
      const expiredRes = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${expiredRawToken}`)
        .expect(401);

      for (const res of [
        noCookieRes,
        malformedRes,
        unknownTokenRes,
        expiredRes,
      ]) {
        expect(res.body).toEqual({
          statusCode: 401,
          message: 'Sesión inválida o expirada',
          error: 'Unauthorized',
        });
      }
    });

    it('si el usuario fue desactivado en PostgreSQL después del login, responde 401 y revoca la sesión rotada', async () => {
      const user = await sandbox.createUser({ isActive: true });

      const loginRes = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const token1 = extractRefreshTokenCookieValue(loginRes);

      await t.prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      const refreshRes = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${token1}`)
        .expect(401);

      expect(refreshRes.body).toEqual({
        statusCode: 401,
        message: 'Sesión inválida o expirada',
        error: 'Unauthorized',
      });

      const activeSessions = await t.prisma.session.count({
        where: { userId: user.id, isRevoked: false },
      });
      expect(activeSessions).toBe(0);
    });
  });

  describe('Detección de reutilización de Refresh Token (TOKEN_REUSE_DETECTED)', () => {
    it('al presentar un refresh token ya rotado, responde 401 opaco y revoca en PostgreSQL toda la familia de sesiones del usuario sin afectar a otros usuarios', async () => {
      const victimUser = await sandbox.createUser({ role: 'EMPLOYEE' });
      const otherUser = await sandbox.createUser({ role: 'EMPLOYEE' });

      // Sesión 1 del usuario víctima (Dispositivo A)
      const loginA = await http()
        .post('/api/auth/login')
        .send({ email: victimUser.email, password: victimUser.password })
        .expect(200);
      const tokenA1 = extractRefreshTokenCookieValue(loginA);

      // Sesión paralela del usuario víctima (Dispositivo B)
      const loginB = await http()
        .post('/api/auth/login')
        .send({ email: victimUser.email, password: victimUser.password })
        .expect(200);
      const tokenB1 = extractRefreshTokenCookieValue(loginB);

      // Sesión activa de otro usuario independiente
      const loginOther = await http()
        .post('/api/auth/login')
        .send({ email: otherUser.email, password: otherUser.password })
        .expect(200);
      const tokenOther = extractRefreshTokenCookieValue(loginOther);

      // Rotación legítima en Dispositivo A: tokenA1 -> tokenA2
      const rotateA = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${tokenA1}`)
        .expect(200);
      const tokenA2 = extractRefreshTokenCookieValue(rotateA);

      // Reutilización del token ya rotado (tokenA1)
      const reuseRes = await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${tokenA1}`)
        .expect(401);

      expect(reuseRes.body).toEqual({
        statusCode: 401,
        message: 'Sesión inválida o expirada',
        error: 'Unauthorized',
      });
      expect(JSON.stringify(reuseRes.body)).not.toContain(
        'TOKEN_REUSE_DETECTED',
      );

      // Todas las sesiones del usuario víctima deben estar revocadas en PostgreSQL
      const victimActiveSessions = await t.prisma.session.count({
        where: { userId: victimUser.id, isRevoked: false },
      });
      expect(victimActiveSessions).toBe(0);

      // Ni tokenA2 ni tokenB1 pueden usarse tras la revocación masiva
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${tokenA2}`)
        .expect(401);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${tokenB1}`)
        .expect(401);

      // La sesión del otro usuario permanece activa e intacta
      const otherSession = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(tokenOther) },
      });
      expect(otherSession.isRevoked).toBe(false);
    });
  });

  describe('Carrera CAS concurrente en vuelo (CAS_RACE_LOST) y rollback físico en PostgreSQL', () => {
    it('cuando dos rotaciones concurrentes compiten en PostgreSQL por la misma sesión activa, una gana (200), la otra pierde con 401 haciendo rollback de su sesión tentativa sin dejar huérfanas ni revocar otras sesiones', async () => {
      const user = await sandbox.createUser({ role: 'EMPLOYEE' });

      // Sesión que será rotada en carrera concurrente
      const loginRace = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const raceToken = extractRefreshTokenCookieValue(loginRace);
      const originalSession = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(raceToken) },
      });

      // Otra sesión activa paralela del mismo usuario (no debe revocarse en CAS_RACE_LOST)
      const loginParallel = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const parallelToken = extractRefreshTokenCookieValue(loginParallel);
      const parallelSession = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(parallelToken) },
      });

      // Bloqueo de fila real en PostgreSQL (FOR NO KEY UPDATE):
      // No bloquea el SELECT inicial (findUnique) de ambas peticiones HTTP, pero retiene el UPDATE
      // de tx.session.updateMany dentro de prisma.$transaction hasta que ambas peticiones hayan
      // insertado su sesión tentativa (tx.session.create) y estén compitiendo por el bloqueo en PostgreSQL.
      let releaseRowLock!: () => void;
      const rowLockReleased = new Promise<void>((resolve) => {
        releaseRowLock = resolve;
      });
      let lockAcquiredResolve!: (pid: number) => void;
      let lockAcquiredReject!: (err: unknown) => void;
      const lockAcquired = new Promise<number>((resolve, reject) => {
        lockAcquiredResolve = resolve;
        lockAcquiredReject = reject;
      });

      const lockHolderPromise = t.prisma
        .$transaction(async (tx) => {
          const rows = await tx.$queryRawUnsafe<Array<{ pid: number }>>(
            'SELECT pg_backend_pid()::int AS pid FROM sessions WHERE id = $1::uuid FOR NO KEY UPDATE',
            originalSession.id,
          );
          const pid = rows[0]?.pid;
          if (!pid) {
            throw new Error(
              'No se pudo adquirir FOR NO KEY UPDATE sobre la sesión original',
            );
          }
          lockAcquiredResolve(pid);
          await rowLockReleased;
        })
        .catch((err: unknown) => {
          lockAcquiredReject(err);
          throw err;
        });

      let req1Promise: Promise<request.Response> | undefined;
      let req2Promise: Promise<request.Response> | undefined;
      let contendingCount = 0;

      try {
        const holderPid = await lockAcquired;

        // .then((res) => res) fuerza a Supertest a despachar ambos requests HTTP de inmediato
        req1Promise = http()
          .post('/api/auth/refresh')
          .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${raceToken}`)
          .then((res) => res);
        req2Promise = http()
          .post('/api/auth/refresh')
          .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${raceToken}`)
          .then((res) => res);

        // Verificamos en pg_stat_activity + pg_locks que las 2 transacciones de refresh:
        // 1) Tengan RowExclusiveLock concedido sobre la tabla sessions (tras insertar la sesión tentativa y ejecutar UPDATE).
        // 2) Estén bloqueadas (wait_event_type = 'Lock') directa o transitivamente por holderPid (el lock sobre originalSession.id).
        for (let attempt = 0; attempt < 80; attempt++) {
          const rows = await t.prisma.$queryRawUnsafe<
            Array<{ contending: number }>
          >(
            `SELECT count(*)::int AS contending
             FROM pg_stat_activity a
             WHERE a.datname = current_database()
               AND a.pid <> $1::int
               AND a.pid <> pg_backend_pid()
               AND a.state = 'active'
               AND a.wait_event_type = 'Lock'
               AND EXISTS (
                 SELECT 1
                 FROM pg_locks l
                 WHERE l.pid = a.pid
                   AND l.relation = 'sessions'::regclass
                   AND l.mode = 'RowExclusiveLock'
                   AND l.granted = true
               )
               AND (
                 $1::int = ANY(pg_blocking_pids(a.pid))
                 OR EXISTS (
                   SELECT 1
                   FROM unnest(pg_blocking_pids(a.pid)) AS blocker_pid
                   WHERE $1::int = ANY(pg_blocking_pids(blocker_pid))
                 )
               )`,
            holderPid,
          );
          contendingCount = rows[0]?.contending ?? 0;
          if (contendingCount >= 2) {
            break;
          }
          await sleep(15);
        }
      } finally {
        releaseRowLock();
        await lockHolderPromise;
        const inflight = [req1Promise, req2Promise].filter(
          (p): p is Promise<request.Response> => p !== undefined,
        );
        if (inflight.length > 0) {
          await Promise.allSettled(inflight);
        }
      }

      expect(contendingCount).toBe(2);

      const [res1, res2] = await Promise.all([req1Promise!, req2Promise!]);
      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 401]);

      const winnerRes = res1.status === 200 ? res1 : res2;
      const loserRes = res1.status === 401 ? res1 : res2;

      expect(loserRes.body).toEqual({
        statusCode: 401,
        message: 'Sesión inválida o expirada',
        error: 'Unauthorized',
      });

      const winnerToken = extractRefreshTokenCookieValue(winnerRes);
      const winnerSession = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(winnerToken) },
      });

      // Verificación física en PostgreSQL:
      // Deben existir exactamente 3 filas para este usuario:
      // 1) originalSession (revocada y apuntando a winnerSession.id)
      // 2) parallelSession (activa, no revocada)
      // 3) winnerSession (activa, no revocada)
      // La sesión tentativa creada por el perdedor dentro de su $transaction fue revertida por PostgreSQL.
      const allUserSessions = await t.prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(allUserSessions).toHaveLength(3);

      const refreshedOriginal = allUserSessions.find(
        (s) => s.id === originalSession.id,
      )!;
      const refreshedParallel = allUserSessions.find(
        (s) => s.id === parallelSession.id,
      )!;
      const refreshedWinner = allUserSessions.find(
        (s) => s.id === winnerSession.id,
      )!;

      expect(refreshedOriginal.isRevoked).toBe(true);
      expect(refreshedOriginal.replacedById).toBe(winnerSession.id);
      expect(refreshedWinner.isRevoked).toBe(false);
      expect(refreshedWinner.replacedById).toBeNull();
      expect(refreshedParallel.isRevoked).toBe(false);
      expect(refreshedParallel.replacedById).toBeNull();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revoca la sesión activa (revoked: true), limpia la cookie refreshToken e impide refrescar posteriormente sin revocar otras sesiones del usuario', async () => {
      const user = await sandbox.createUser();

      const login1 = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const token1 = extractRefreshTokenCookieValue(login1);

      const login2 = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const token2 = extractRefreshTokenCookieValue(login2);

      const logoutRes = await http()
        .post('/api/auth/logout')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${token1}`)
        .expect(200);

      expect(logoutRes.body).toEqual({ revoked: true });

      const clearHeader = findCookieHeader(
        logoutRes,
        REFRESH_TOKEN_COOKIE_NAME,
      );
      expect(clearHeader).toBeDefined();
      expect(clearHeader).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=;`);
      expect(clearHeader).toContain(`Path=${REFRESH_TOKEN_COOKIE_PATH}`);
      expect(clearHeader).toContain('HttpOnly');

      const session1 = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(token1) },
      });
      expect(session1.isRevoked).toBe(true);
      expect(session1.replacedById).toBeNull();

      // Intentar refrescar con el token cerrado responde 401 (MANUALLY_REVOKED) pero NO revoca token2
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${token1}`)
        .expect(401);

      const session2 = await t.prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(token2) },
      });
      expect(session2.isRevoked).toBe(false);

      // Segundo logout con el mismo token es idempotente y devuelve revoked: false
      const secondLogout = await http()
        .post('/api/auth/logout')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${token1}`)
        .expect(200);
      expect(secondLogout.body).toEqual({ revoked: false });
    });

    it('es idempotente cuando se invoca sin cookie o con un token desconocido (revoked: false)', async () => {
      const noCookieRes = await http().post('/api/auth/logout').expect(200);
      expect(noCookieRes.body).toEqual({ revoked: false });

      const unknownRes = await http()
        .post('/api/auth/logout')
        .set('Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=${generateRefreshToken()}`)
        .expect(200);
      expect(unknownRes.body).toEqual({ revoked: false });
    });
  });
});
