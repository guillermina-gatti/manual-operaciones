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
import { AssistantMetricsController } from './assistant-metrics.controller';
import { AssistantMetricsService } from './assistant-metrics.service';
import type { AssistantMetricsView } from './assistant-metrics.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const ADMIN = bearer(SPEC_USERS.admin);
const SUPERVISOR = bearer(SPEC_USERS.supervisorVentas);
const EMPLOYEE = bearer(SPEC_USERS.empleadoVentas);

const view: AssistantMetricsView = {
  filters: { areaId: null, from: null, to: null },
  totals: {
    questions: 3,
    answered: 1,
    noInfo: 1,
    conflict: 0,
    aiUnavailable: 1,
    smallTalk: 2,
    latencyP50Ms: 1500,
    latencyP95Ms: null,
    inputTokens: 400,
    outputTokens: 80,
    feedback: { useful: 1, notUseful: 0 },
  },
};

describe('AssistantMetricsController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: { assistant: jest.Mock };

  beforeAll(async () => {
    service = { assistant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [AssistantMetricsController],
      providers: [
        { provide: AssistantMetricsService, useValue: service },
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
    request(app.getHttpServer()).get(`/api/metrics/assistant${query}`);

  it('200 for ADMIN, passing the user and the filters to the service', async () => {
    service.assistant.mockResolvedValue(view);

    const response = await get(
      `?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
    )
      .set(ADMIN)
      .expect(200);

    expect(response.body).toEqual(view);
    expect(service.assistant).toHaveBeenCalledWith(SPEC_USERS.admin, {
      areaId: VENTAS,
      from: '2026-10-01',
      to: '2026-10-27',
    });
  });

  it('200 for SUPERVISOR, without filters', async () => {
    service.assistant.mockResolvedValue(view);

    await get().set(SUPERVISOR).expect(200);

    expect(service.assistant).toHaveBeenCalledWith(
      SPEC_USERS.supervisorVentas,
      { areaId: undefined, from: undefined, to: undefined },
    );
  });

  it('the latency null goes out as null', async () => {
    service.assistant.mockResolvedValue(view);

    const response = await get().set(ADMIN).expect(200);

    expect(response.body.totals.latencyP95Ms).toBeNull();
  });

  it('401 without a token', async () => {
    await get().expect(401);
    expect(service.assistant).not.toHaveBeenCalled();
  });

  it('403 for EMPLOYEE', async () => {
    await get().set(EMPLOYEE).expect(403);
    expect(service.assistant).not.toHaveBeenCalled();
  });

  it.each([
    ['areaId that is not a UUID', '?areaId=ventas'],
    ['a day that does not exist', '?from=2026-02-30'],
    ['a date-time', '?to=2026-10-27T23:59:59Z'],
    [
      'a parameter it does not know',
      '?userId=0b000000-0000-4000-8000-000000000003',
    ],
  ])('400 with %s', async (_, query) => {
    await get(query).set(ADMIN).expect(400);
    expect(service.assistant).not.toHaveBeenCalled();
  });

  it('the 404 and 503 of the service go out as they are', async () => {
    service.assistant.mockRejectedValueOnce(
      new NotFoundException('No se encontró el área'),
    );
    await get(`?areaId=${VENTAS}`).set(SUPERVISOR).expect(404);

    service.assistant.mockRejectedValueOnce(
      new ServiceUnavailableException('No se pudo completar'),
    );
    await get().set(ADMIN).expect(503);
  });
});
