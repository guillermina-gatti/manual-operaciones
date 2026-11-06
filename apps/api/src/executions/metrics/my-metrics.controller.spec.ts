import {
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  bearer,
  realAuthProviders,
  SPEC_USERS,
} from '../../../test/executions/real-auth';
import { configureApp } from '../../app.setup';
import { MyMetricsController } from './my-metrics.controller';
import { MyMetricsService } from './my-metrics.service';
import type { MyMetricsView } from './my-metrics.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const ADMIN = bearer(SPEC_USERS.admin);
const SUPERVISOR = bearer(SPEC_USERS.supervisorVentas);
const EMPLOYEE = bearer(SPEC_USERS.empleadoVentas);

const STARTED = new Date('2026-11-05T13:00:00.000Z');

const view: MyMetricsView = {
  filters: { areaId: null, from: null, to: null },
  staleAfterHours: 24,
  areaIds: [VENTAS],
  totals: {
    started: 1,
    completed: 0,
    inProgress: 1,
    abandoned: 0,
    avgCompletionMs: null,
  },
  resume: [
    {
      executionId: '1e000000-0000-4000-8000-000000000001',
      procedureId: '1a000000-0000-4000-8000-000000000001',
      procedureVersionId: '1b000000-0000-4000-8000-000000000002',
      currentStep: {
        stepId: '1c000000-0000-4000-8000-000000000012',
        order: 2,
        title: 'Contar los comprobantes de tarjeta',
      },
      totalSteps: 4,
      startedAt: STARTED,
      lastActivityAt: STARTED,
      stale: false,
    },
  ],
  procedures: [],
};

describe('MyMetricsController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: { mine: jest.Mock };

  beforeAll(async () => {
    service = { mine: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [MyMetricsController],
      providers: [
        { provide: MyMetricsService, useValue: service },
        ...realAuthProviders(), // the real JwtAuthGuard, users from a fake database
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app); // /api prefix, ValidationPipe and Swagger, as in main.ts
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const get = (query = '') =>
    request(app.getHttpServer()).get(`/api/metrics/me${query}`);

  it('200 for EMPLOYEE, with the user of the session and the filters', async () => {
    service.mine.mockResolvedValue(view);

    const response = await get(
      `?areaId=${VENTAS}&from=2026-11-01&to=2026-11-06`,
    )
      .set(EMPLOYEE)
      .expect(200);

    expect(service.mine).toHaveBeenCalledWith(SPEC_USERS.empleadoVentas, {
      areaId: VENTAS,
      from: '2026-11-01',
      to: '2026-11-06',
    });
    expect(response.body.resume[0]).toEqual({
      ...view.resume[0],
      startedAt: '2026-11-05T13:00:00.000Z',
      lastActivityAt: '2026-11-05T13:00:00.000Z',
    });
  });

  it('401 without a session', async () => {
    await get().expect(401);

    expect(service.mine).not.toHaveBeenCalled();
  });

  it.each([
    ['ADMIN', ADMIN],
    ['SUPERVISOR', SUPERVISOR],
  ])(
    '403 for %s: personal metrics are only for employees',
    async (_role, headers) => {
      await get().set(headers).expect(403);

      expect(service.mine).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'a userId: the user is always the one of the session',
      `?userId=${SPEC_USERS.admin.id}`,
    ],
    ['an areaId that is not a UUID', '?areaId=ventas'],
    ['a day that does not exist', '?from=2026-02-30'],
    ['a date-time instead of a day', '?to=2026-11-06T10:00:00Z'],
  ])('400 with %s, without calling the service', async (_case, query) => {
    await get(query).set(EMPLOYEE).expect(400);

    expect(service.mine).not.toHaveBeenCalled();
  });

  it('404 when the area is not one of the active areas of the employee', async () => {
    service.mine.mockRejectedValue(
      new NotFoundException('No se encontró el área'),
    );

    const response = await get(`?areaId=${VENTAS}`).set(EMPLOYEE).expect(404);

    expect(response.body.message).toBe('No se encontró el área');
  });

  it('503 when a dependency is down', async () => {
    service.mine.mockRejectedValue(
      new ServiceUnavailableException(
        'No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.',
      ),
    );

    await get().set(EMPLOYEE).expect(503);
  });

  it('GET /metrics/procedures is not answered by this controller', async () => {
    await request(app.getHttpServer())
      .get('/api/metrics/procedures')
      .set(EMPLOYEE)
      .expect(404);
  });
});
