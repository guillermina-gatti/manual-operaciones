/* Pruebas E2E de Invitaciones con AWS SES simulado (HU30 / M4)
 * Verifica la integración HTTP -> UsersModule -> SesInvitationDeliveryService -> PostgreSQL
 * con configuración de producción y cliente SES simulado sin llamadas reales a AWS.
 */

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AuthRateLimiterService } from '../../src/auth/auth-rate-limiter.service';
import { FakeProcessingQueue } from '../../src/documents/adapters/fake-processing-queue';
import { LoggerAuditLog } from '../../src/documents/adapters/logger-audit-log';
import { AuditLog } from '../../src/documents/ports/audit-log';
import { ProcessingQueue } from '../../src/documents/ports/processing-queue';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { FileStorage } from '../../src/storage/file-storage';
import { InMemoryFileStorage } from '../../src/storage/in-memory-file-storage';
import {
  SesInvitationDeliveryService,
  type SesClientFactory,
} from '../../src/users/ses-invitation-delivery.service';
import {
  assertTestRedisIsolated,
  useE2eDatabase,
  useTestRedis,
} from '../test-database';
import { AuthTestSandbox, assertTestDatabaseConnected } from './helpers';

describe('Invitaciones con proveedor AWS SES simulado - HU30 (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let rateLimiter: AuthRateLimiterService;
  let sandbox: AuthTestSandbox;
  let adminAccessToken: string;
  let areaId: string;

  const trackedInvitationEmails = new Set<string>();

  const defaultConfig = (): Record<string, string | undefined> => ({
    ...process.env,
    NODE_ENV: 'production',
    INVITATION_EMAIL_PROVIDER: 'ses',
    AWS_REGION: 'us-east-1',
    AWS_SES_REGION: 'us-east-1',
    INVITATION_EMAIL_FROM: 'PispIAr <invitaciones@example.com>',
    FRONTEND_URL: 'https://pispiar.example',
  });

  let configValues: Record<string, string | undefined> = defaultConfig();
  const sendMock = jest.fn();

  beforeAll(async () => {
    useE2eDatabase();
    useTestRedis();

    configValues = defaultConfig();

    const sesClientFactory: SesClientFactory = () => ({
      send: sendMock,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string): string | undefined => configValues[key],
      })
      .overrideProvider(SesInvitationDeliveryService)
      .useFactory({
        factory: (configService: ConfigService) =>
          new SesInvitationDeliveryService(configService, sesClientFactory),
        inject: [ConfigService],
      })
      .overrideProvider(FileStorage)
      .useValue(new InMemoryFileStorage())
      .overrideProvider(ProcessingQueue)
      .useValue(new FakeProcessingQueue())
      .overrideProvider(AuditLog)
      .useValue(new LoggerAuditLog())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    rateLimiter = app.get(AuthRateLimiterService);

    await assertTestDatabaseConnected(prisma);
    await assertTestRedisIsolated(redis);

    sandbox = new AuthTestSandbox(prisma, redis, rateLimiter);

    const admin = await sandbox.createUser({
      name: 'Admin SES E2E',
      role: 'ADMIN',
    });
    const area = await sandbox.createArea({
      name: 'Operaciones SES E2E',
      isActive: true,
    });
    areaId = area.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: admin.email,
        password: admin.password,
      })
      .expect(200);

    adminAccessToken = loginRes.body.accessToken as string;
  });

  beforeEach(() => {
    configValues = defaultConfig();
    sendMock.mockReset();
  });

  afterEach(async () => {
    if (trackedInvitationEmails.size > 0) {
      const emails = [...trackedInvitationEmails];
      await prisma.userInvitationArea.deleteMany({
        where: {
          invitation: { email: { in: emails } },
        },
      });
      await prisma.userInvitation.deleteMany({
        where: {
          email: { in: emails },
        },
      });
      trackedInvitationEmails.clear();
    }
  });

  afterAll(async () => {
    await sandbox?.cleanup();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('entrega simulada exitosa: responde 201 sin token ni invitationUrl y persiste en PostgreSQL', async () => {
    sendMock.mockResolvedValueOnce({ MessageId: 'ses-e2e-msg-1' });
    const targetEmail = `ses.ok.${randomUUID().slice(0, 8)}@empresa.com`;
    trackedInvitationEmails.add(targetEmail.toLowerCase());

    const res = await http()
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        email: targetEmail,
        role: 'EMPLOYEE',
        areaIds: [areaId],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(targetEmail.toLowerCase());
    expect(res.body.role).toBe('EMPLOYEE');
    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('invitationUrl');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const persisted = await prisma.userInvitation.findUnique({
      where: { id: res.body.id as string },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.revokedAt).toBeNull();
    expect(persisted!.acceptedAt).toBeNull();
  });

  it('error de configuración: responde 503 y no persiste la invitación en PostgreSQL', async () => {
    configValues.INVITATION_EMAIL_FROM = '';
    const targetEmail = `ses.cfg.${randomUUID().slice(0, 8)}@empresa.com`;
    trackedInvitationEmails.add(targetEmail.toLowerCase());

    await http()
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        email: targetEmail,
        role: 'EMPLOYEE',
        areaIds: [areaId],
      })
      .expect(503);

    expect(sendMock).not.toHaveBeenCalled();

    const count = await prisma.userInvitation.count({
      where: { email: targetEmail.toLowerCase() },
    });
    expect(count).toBe(0);
  });

  it('fallo de entrega: responde 503 y persiste la revocación compensatoria en PostgreSQL', async () => {
    sendMock.mockRejectedValueOnce(new Error('Simulated AWS SES failure'));
    const targetEmail = `ses.fail.${randomUUID().slice(0, 8)}@empresa.com`;
    trackedInvitationEmails.add(targetEmail.toLowerCase());

    await http()
      .post('/api/users/invitations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        email: targetEmail,
        role: 'EMPLOYEE',
        areaIds: [areaId],
      })
      .expect(503);

    expect(sendMock).toHaveBeenCalledTimes(1);

    const persisted = await prisma.userInvitation.findFirst({
      where: { email: targetEmail.toLowerCase() },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.revokedAt).not.toBeNull();
  });
});
