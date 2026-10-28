/* Arnés compartido para las pruebas E2E de autenticación, sesiones, rate limiting y autorización */

import { INestApplication, Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AccessService } from '../../src/auth/access.service';
import { AuthRateLimiterService } from '../../src/auth/auth-rate-limiter.service';
import { REFRESH_TOKEN_COOKIE_NAME } from '../../src/auth/auth.controller';
import { ACCESS_TOKEN_TTL_SECONDS, AuthService } from '../../src/auth/auth.service';
import { PasswordService } from '../../src/auth/password.service';
import { SessionService } from '../../src/auth/session.service';
import type { Role } from '../../src/common/auth';
import { FakeProcessingQueue } from '../../src/documents/adapters/fake-processing-queue';
import { LoggerAuditLog } from '../../src/documents/adapters/logger-audit-log';
import { AuditLog } from '../../src/documents/ports/audit-log';
import { ProcessingQueue } from '../../src/documents/ports/processing-queue';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { FileStorage } from '../../src/storage/file-storage';
import { InMemoryFileStorage } from '../../src/storage/in-memory-file-storage';

export const AUTH_E2E_PASSWORD = 'AuthE2e-ValidPassword!2026';
export const LOOPBACK_IPS = ['127.0.0.1', '::ffff:127.0.0.1', '::1'] as const;

const testPasswordService = new PasswordService();
const testJwtService = new JwtService();
let cachedAuthPasswordHashPromise: Promise<string> | null = null;

export function getAuthTestPasswordHash(): Promise<string> {
  if (!cachedAuthPasswordHashPromise) {
    cachedAuthPasswordHashPromise = testPasswordService.hash(AUTH_E2E_PASSWORD);
  }
  return cachedAuthPasswordHashPromise;
}

export function resolveTestJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'Falta JWT_SECRET en el entorno de pruebas: debe coincidir con el secreto que consume JwtAuthGuard',
    );
  }
  return secret;
}

export function signTestJwt(
  payload: Record<string, unknown>,
  options?: { secret?: string; expiresIn?: number | string },
): string {
  const secret = options?.secret ?? resolveTestJwtSecret();
  const expiresIn = options?.expiresIn ?? ACCESS_TOKEN_TTL_SECONDS;
  return testJwtService.sign(payload, {
    secret,
    expiresIn: expiresIn as number,
  });
}

export async function assertTestDatabaseConnected(
  prisma: PrismaService,
): Promise<void> {
  const activeUrl = process.env.DATABASE_URL;
  if (!activeUrl) {
    throw new Error(
      'Operación E2E abortada: DATABASE_URL no está configurada',
    );
  }

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || activeUrl !== testUrl) {
    throw new Error(
      'Operación E2E abortada: DATABASE_URL no coincide con TEST_DATABASE_URL',
    );
  }

  const { hostname, pathname } = new URL(activeUrl);
  const expectedDatabase = decodeURIComponent(pathname.replace(/^\//, ''));
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocalHost || !expectedDatabase.endsWith('_test')) {
    throw new Error(
      `Operación E2E abortada: DATABASE_URL apunta a "${expectedDatabase}" en "${hostname}" (se requiere base local *_test)`,
    );
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{ current_database: string }>
  >('SELECT current_database()');
  const connectedDatabase = rows[0]?.current_database;
  if (
    !connectedDatabase ||
    !connectedDatabase.endsWith('_test') ||
    connectedDatabase !== expectedDatabase
  ) {
    throw new Error(
      `Operación E2E abortada: la instancia de Prisma está conectada a "${connectedDatabase ?? 'desconocida'}" (se esperaba "${expectedDatabase}")`,
    );
  }
}

export interface AuthTestApp {
  app: INestApplication;
  prisma: PrismaService;
  redis: Redis;
  rateLimiter: AuthRateLimiterService;
  sessionService: SessionService;
  authService: AuthService;
  accessService: AccessService;
  jwtService: JwtService;
  storage: InMemoryFileStorage;
  queue: FakeProcessingQueue;
  audit: LoggerAuditLog;
}

export async function createAuthTestApp(
  extraControllers: Type<unknown>[] = [],
): Promise<AuthTestApp> {
  const storage = new InMemoryFileStorage();
  const queue = new FakeProcessingQueue();
  const audit = new LoggerAuditLog();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  })
    .overrideProvider(FileStorage)
    .useValue(storage)
    .overrideProvider(ProcessingQueue)
    .useValue(queue)
    .overrideProvider(AuditLog)
    .useValue(audit)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    redis: app.get<Redis>(REDIS_CLIENT),
    rateLimiter: app.get(AuthRateLimiterService),
    sessionService: app.get(SessionService),
    authService: app.get(AuthService),
    accessService: app.get(AccessService),
    jwtService: app.get(JwtService),
    storage,
    queue,
    audit,
  };
}

export interface SeededAuthArea {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SeededAuthUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  isActive: boolean;
  areaIds: string[];
}

/**
 * Aísla los registros creados en PostgreSQL y las claves de rate limiting en Redis
 * durante cada caso de prueba, limpiando únicamente lo que creó ese test sin usar
 * TRUNCATE indiscriminado ni FLUSHALL/FLUSHDB.
 */
export class AuthTestSandbox {
  private readonly userIds = new Set<string>();
  private readonly areaIds = new Set<string>();
  private readonly emails = new Set<string>();
  private readonly customIps = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
    private readonly rateLimiter: AuthRateLimiterService,
  ) {}

  trackEmail(email: string): string {
    this.emails.add(email.trim().toLowerCase());
    return email;
  }

  trackIp(ip: string): string {
    this.customIps.add(ip.trim());
    return ip;
  }

  async createArea(opts?: {
    id?: string;
    name?: string;
    isActive?: boolean;
  }): Promise<SeededAuthArea> {
    await assertTestDatabaseConnected(this.prisma);
    const id = opts?.id ?? randomUUID();
    const name = opts?.name ?? `Auth E2E Area ${id}`;
    const isActive = opts?.isActive ?? true;

    await this.prisma.area.create({
      data: {
        id,
        name,
        isActive,
      },
    });
    this.areaIds.add(id);

    return { id, name, isActive };
  }

  async createUser(opts?: {
    id?: string;
    name?: string;
    email?: string;
    password?: string;
    role?: Role;
    isActive?: boolean;
    areaIds?: string[];
  }): Promise<SeededAuthUser> {
    await assertTestDatabaseConnected(this.prisma);
    const id = opts?.id ?? randomUUID();
    const name = opts?.name ?? `Usuario E2E ${id.slice(0, 8)}`;
    const email = (
      opts?.email ?? `auth-e2e-${id}@auth.test.invalid`
    ).toLowerCase();
    const password = opts?.password ?? AUTH_E2E_PASSWORD;
    const role: Role = opts?.role ?? 'EMPLOYEE';
    const isActive = opts?.isActive ?? true;
    const areaIds = opts?.areaIds ?? [];

    const passwordHash =
      password === AUTH_E2E_PASSWORD
        ? await getAuthTestPasswordHash()
        : await testPasswordService.hash(password);

    await this.prisma.user.create({
      data: {
        id,
        name,
        email,
        passwordHash,
        role,
        isActive,
        ...(areaIds.length > 0 && {
          areas: {
            createMany: {
              data: areaIds.map((areaId) => ({ areaId })),
            },
          },
        }),
      },
    });

    this.userIds.add(id);
    this.emails.add(email);

    return {
      id,
      name,
      email,
      password,
      role,
      isActive,
      areaIds,
    };
  }

  async cleanRedisKeys(): Promise<void> {
    const ips = new Set<string>([...LOOPBACK_IPS, ...this.customIps]);
    const keysToDelete: string[] = [];

    for (const ip of ips) {
      keysToDelete.push(this.rateLimiter.getGlobalIpKey(ip));
      for (const email of this.emails) {
        keysToDelete.push(this.rateLimiter.getAccountIpKey(email, ip));
      }
    }

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete);
    }
  }

  async cleanup(): Promise<void> {
    await this.cleanRedisKeys();
    await assertTestDatabaseConnected(this.prisma);

    const trackedUsers = [...this.userIds];
    const trackedAreas = [...this.areaIds];

    if (trackedUsers.length > 0) {
      await this.prisma.session.deleteMany({
        where: { userId: { in: trackedUsers } },
      });
      await this.prisma.userArea.deleteMany({
        where: { userId: { in: trackedUsers } },
      });
      await this.prisma.user.deleteMany({
        where: { id: { in: trackedUsers } },
      });
    }

    if (trackedAreas.length > 0) {
      await this.prisma.userArea.deleteMany({
        where: { areaId: { in: trackedAreas } },
      });
      await this.prisma.area.deleteMany({
        where: { id: { in: trackedAreas } },
      });
    }

    this.userIds.clear();
    this.areaIds.clear();
    this.emails.clear();
    this.customIps.clear();
  }
}

export function extractSetCookieHeaders(res: Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [String(raw)];
}

export function findCookieHeader(
  res: Response,
  cookieName = REFRESH_TOKEN_COOKIE_NAME,
): string | undefined {
  return extractSetCookieHeaders(res).find((header) =>
    header.startsWith(`${cookieName}=`),
  );
}

export function extractRefreshTokenCookieValue(res: Response): string {
  const header = findCookieHeader(res, REFRESH_TOKEN_COOKIE_NAME);
  if (!header) {
    throw new Error(
      `No se encontró la cookie ${REFRESH_TOKEN_COOKIE_NAME} en Set-Cookie`,
    );
  }
  const firstSegment = header.split(';')[0] ?? '';
  const eqIndex = firstSegment.indexOf('=');
  if (eqIndex === -1) {
    return '';
  }
  return decodeURIComponent(firstSegment.slice(eqIndex + 1));
}
