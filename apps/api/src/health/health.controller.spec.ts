import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../app.setup';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { HealthController } from './health.controller';

describe('A-21B.1 - Healthcheck de la API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
});
