import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../app.setup';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

describe('A-21B.1 - Healthcheck de la API', () => {
  let app: INestApplication;
  const readiness = {
    check: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ReadinessService, useValue: readiness }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    readiness.check.mockResolvedValue({
      status: 'ok',
      checks: { postgresql: 'up', redis: 'up' },
    });
  });

  it('GET /api/health/live responde HTTP 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('evita almacenar en caché la respuesta', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('está marcado como endpoint público', () => {
    const reflector = new Reflector();

    const isPublic = reflector.get<boolean>(
      IS_PUBLIC_KEY,
      HealthController.prototype.live,
    );

    expect(isPublic).toBe(true);
  });

  it('GET /api/health/ready responde 200 sin detalles internos cuando está listo', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      checks: { postgresql: 'up', redis: 'up' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/health/ready responde 503 sanitizado si no está listo', async () => {
    readiness.check.mockResolvedValue({
      status: 'unavailable',
      checks: { postgresql: 'down', redis: 'timeout' },
    });

    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);

    expect(response.body).toEqual({
      status: 'unavailable',
      checks: { postgresql: 'down', redis: 'timeout' },
    });
    expect(JSON.stringify(response.body)).not.toContain('Error');
  });

  it('readiness también está marcado como endpoint público', () => {
    const reflector = new Reflector();
    const readyHandler = Object.getOwnPropertyDescriptor(
      HealthController.prototype,
      'ready',
    )?.value as HealthController['ready'];

    expect(reflector.get<boolean>(IS_PUBLIC_KEY, readyHandler)).toBe(true);
  });
});
