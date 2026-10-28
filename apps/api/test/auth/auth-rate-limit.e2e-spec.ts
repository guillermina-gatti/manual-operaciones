/* Pruebas E2E del control de tasa de autenticación (Redis Rate Limiting) y política Fail-Closed */

import request from 'supertest';
import {
  ACCOUNT_IP_MAX_ATTEMPTS,
  BLOCK_WINDOW_SECONDS,
  GLOBAL_IP_MAX_ATTEMPTS,
} from '../../src/auth/auth-rate-limiter.service';
import {
  AuthTestApp,
  AuthTestSandbox,
  LOOPBACK_IPS,
  createAuthTestApp,
} from './helpers';

describe('Auth Rate Limiting (E2E)', () => {
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

  it('bloquea con 429 (ACCOUNT_IP) en el 6.º intento tras 5 fallos consecutivos, incluso si el 6.º envía la contraseña correcta', async () => {
    const user = await sandbox.createUser({ role: 'EMPLOYEE' });

    for (let i = 1; i <= ACCOUNT_IP_MAX_ATTEMPTS; i++) {
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'PasswordIncorrecta!' })
        .expect(401);
    }

    // 6.º intento con la contraseña válida debe ser bloqueado por rate limiter antes de autenticar
    const blockedRes = await http()
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(429);

    expect(blockedRes.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.stringContaining(
        'Demasiados intentos fallidos para esta cuenta',
      ),
      retryAfter: expect.any(Number),
      limitType: 'ACCOUNT_IP',
    });
    expect(blockedRes.body.retryAfter).toBeGreaterThan(0);
    expect(blockedRes.body.retryAfter).toBeLessThanOrEqual(
      BLOCK_WINDOW_SECONDS,
    );

    const sessionsCount = await t.prisma.session.count({
      where: { userId: user.id },
    });
    expect(sessionsCount).toBe(0);
  });

  it('aplica restablecimiento asimétrico tras login exitoso: limpia la clave de cuenta+IP pero preserva el contador global de la IP en Redis', async () => {
    const user = await sandbox.createUser({ role: 'EMPLOYEE' });

    for (let i = 1; i <= 3; i++) {
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'PasswordIncorrecta!' })
        .expect(401);
    }

    // Login exitoso en el 4.º intento
    const loginRes = await http()
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(loginRes.body.accessToken).toEqual(expect.any(String));

    const session = await t.prisma.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    const observedIp = session.ipAddress ?? '127.0.0.1';
    sandbox.trackIp(observedIp);

    const accKey = t.rateLimiter.getAccountIpKey(user.email, observedIp);
    const ipKey = t.rateLimiter.getGlobalIpKey(observedIp);

    const [accVal, ipVal] = await t.redis.mget(accKey, ipKey);
    expect(accVal).toBeNull();
    expect(ipVal).toBe('3');
  });

  it('bloquea con 429 (GLOBAL_IP) cuando el contador global de la IP alcanza el umbral de 50 intentos, aunque la cuenta no tenga fallos previos', async () => {
    const user = await sandbox.createUser({ role: 'EMPLOYEE' });

    // Pre-sembramos el umbral GLOBAL_IP únicamente en las claves loopback de prueba (sin disparar 50 llamadas bcrypt)
    for (const ip of LOOPBACK_IPS) {
      await t.redis.set(
        t.rateLimiter.getGlobalIpKey(ip),
        String(GLOBAL_IP_MAX_ATTEMPTS),
        'EX',
        BLOCK_WINDOW_SECONDS,
      );
    }

    const blockedRes = await http()
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(429);

    expect(blockedRes.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.stringContaining(
        'Demasiados intentos fallidos desde esta dirección IP',
      ),
      retryAfter: expect.any(Number),
      limitType: 'GLOBAL_IP',
    });
    expect(blockedRes.body.retryAfter).toBeGreaterThan(0);
    expect(blockedRes.body.retryAfter).toBeLessThanOrEqual(
      BLOCK_WINDOW_SECONDS,
    );
  });

  it('aplica política Fail-Closed (503 Service Unavailable) sin filtrar datos internos cuando el contador en Redis está corrupto', async () => {
    const user = await sandbox.createUser({ role: 'EMPLOYEE' });

    for (const ip of LOOPBACK_IPS) {
      await t.redis.set(
        t.rateLimiter.getAccountIpKey(user.email, ip),
        'contador-corrupto-no-decimal',
        'EX',
        60,
      );
    }

    const res = await http()
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(503);

    expect(res.body).toEqual({
      statusCode: 503,
      message:
        'Servicio de autenticación no disponible temporalmente. Intente nuevamente más tarde.',
      error: 'Service Unavailable',
    });
    expect(JSON.stringify(res.body)).not.toContain(
      'contador-corrupto-no-decimal',
    );
    expect(JSON.stringify(res.body)).not.toContain(user.email);

    const sessionsCount = await t.prisma.session.count({
      where: { userId: user.id },
    });
    expect(sessionsCount).toBe(0);
  });
});
