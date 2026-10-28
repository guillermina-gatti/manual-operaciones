import {
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup';
import { ProcedureMetricsController } from './procedure-metrics.controller';
import { ProcedureMetricsService } from './procedure-metrics.service';
import type { ProcedureMetricsView } from './procedure-metrics.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const ADMIN = {
  'x-user-id': '0b000000-0000-4000-8000-000000000001',
  'x-user-role': 'ADMIN',
};
const SUPERVISOR = {
  'x-user-id': '0b000000-0000-4000-8000-000000000002',
  'x-user-role': 'SUPERVISOR',
};
const EMPLOYEE = {
  'x-user-id': '0b000000-0000-4000-8000-000000000003',
  'x-user-role': 'EMPLOYEE',
};

const view: ProcedureMetricsView = {
  filters: { areaId: null, from: null, to: null },
  staleAfterHours: 24,
  areaIds: null,
  totals: {
    started: 0,
    completed: 0,
    inProgress: 0,
    abandoned: 0,
    completionRate: null,
  },
  procedures: [],
};

describe('ProcedureMetricsController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: { procedures: jest.Mock };

  beforeAll(async () => {
    service = { procedures: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcedureMetricsController],
      providers: [{ provide: ProcedureMetricsService, useValue: service }],
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
    request(app.getHttpServer()).get(`/api/metrics/procedures${query}`);

  it('200 for ADMIN, passing the user and the filters to the service', async () => {
    service.procedures.mockResolvedValue(view);

    const response = await get(
      `?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
    )
      .set(ADMIN)
      .expect(200);

    expect(response.body).toEqual(view);
    expect(service.procedures).toHaveBeenCalledWith(
      { id: ADMIN['x-user-id'], role: 'ADMIN' },
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
    );
  });

  it('200 for SUPERVISOR, without filters', async () => {
    service.procedures.mockResolvedValue(view);

    await get().set(SUPERVISOR).expect(200);

    expect(service.procedures).toHaveBeenCalledWith(
      { id: SUPERVISOR['x-user-id'], role: 'SUPERVISOR' },
      { areaId: undefined, from: undefined, to: undefined },
    );
  });

  it('401 without a session', async () => {
    await get().expect(401);

    expect(service.procedures).not.toHaveBeenCalled();
  });

  it('403 for EMPLOYEE', async () => {
    await get().set(EMPLOYEE).expect(403);

    expect(service.procedures).not.toHaveBeenCalled();
  });

  it.each([
    ['an areaId that is not a UUID', '?areaId=ventas'],
    ['a day that does not exist', '?from=2026-02-30'],
    ['a date-time instead of a day', '?to=2026-10-27T10:00:00Z'],
    ['an unknown parameter', '?userId=x'],
  ])('400 with %s, without calling the service', async (_case, query) => {
    await get(query).set(ADMIN).expect(400);

    expect(service.procedures).not.toHaveBeenCalled();
  });

  it('404 when a supervisor asks for an area that is not theirs', async () => {
    service.procedures.mockRejectedValue(
      new NotFoundException('No se encontró el área'),
    );

    const response = await get(`?areaId=${VENTAS}`).set(SUPERVISOR).expect(404);

    expect(response.body.message).toBe('No se encontró el área');
  });

  it('503 when a dependency is down', async () => {
    service.procedures.mockRejectedValue(
      new ServiceUnavailableException(
        'No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.',
      ),
    );

    await get().set(ADMIN).expect(503);
  });
});
