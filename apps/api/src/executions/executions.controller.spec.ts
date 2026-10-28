import {
  ConflictException,
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
} from '../../test/executions/real-auth';
import { configureApp } from '../app.setup';
import { ExecutionService } from './execution.service';
import type { ExecutionView } from './execution.service';
import { ExecutionsController } from './executions.controller';

const EXECUTION_ID = '1d000000-0000-4000-8000-000000000001';
const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const STEP_1 = '1c000000-0000-4000-8000-000000000001';
const EMPLOYEE = bearer(SPEC_USERS.empleadoVentas);

const view: ExecutionView = {
  id: EXECUTION_ID,
  procedureId: PROCEDURE_ID,
  procedureVersionId: '1b000000-0000-4000-8000-000000000001',
  status: 'IN_PROGRESS',
  startedAt: new Date('2026-10-27T10:00:00.000Z'),
  finishedAt: null,
  currentStepId: STEP_1,
  steps: [
    {
      stepId: STEP_1,
      order: 1,
      title: 'Contar el efectivo',
      startedAt: new Date('2026-10-27T10:00:00.000Z'),
      finishedAt: null,
      durationMs: null,
    },
  ],
};

const body = {
  id: EXECUTION_ID,
  procedureId: PROCEDURE_ID,
  procedureVersionId: '1b000000-0000-4000-8000-000000000001',
  status: 'IN_PROGRESS',
  startedAt: '2026-10-27T10:00:00.000Z',
  finishedAt: null,
  currentStepId: STEP_1,
  steps: [
    {
      stepId: STEP_1,
      order: 1,
      title: 'Contar el efectivo',
      startedAt: '2026-10-27T10:00:00.000Z',
      finishedAt: null,
      durationMs: null,
    },
  ],
};

describe('ExecutionsController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: {
    start: jest.Mock;
    findOne: jest.Mock;
    completeStep: jest.Mock;
  };

  beforeAll(async () => {
    service = { start: jest.fn(), findOne: jest.fn(), completeStep: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [ExecutionsController],
      providers: [
        { provide: ExecutionService, useValue: service },
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

  const http = () => request(app.getHttpServer());

  describe('POST /api/executions', () => {
    it('201 with the new execution', async () => {
      service.start.mockResolvedValue({ execution: view, created: true });

      const response = await http()
        .post('/api/executions')
        .set(EMPLOYEE)
        .send({ procedureId: PROCEDURE_ID })
        .expect(201);

      expect(response.body).toEqual(body);
      expect(service.start).toHaveBeenCalledWith(
        SPEC_USERS.empleadoVentas,
        PROCEDURE_ID,
      );
    });

    it('200 with the execution already in progress', async () => {
      service.start.mockResolvedValue({ execution: view, created: false });

      const response = await http()
        .post('/api/executions')
        .set(EMPLOYEE)
        .send({ procedureId: PROCEDURE_ID })
        .expect(200);

      expect(response.body).toEqual(body);
    });

    it.each([
      ['no procedureId', {}],
      ['a procedureId that is not a UUID', { procedureId: 'cierre' }],
      ['an extra property', { procedureId: PROCEDURE_ID, userId: 'x' }],
    ])('400 with %s, without calling the service', async (_case, payload) => {
      await http()
        .post('/api/executions')
        .set(EMPLOYEE)
        .send(payload)
        .expect(400);

      expect(service.start).not.toHaveBeenCalled();
    });

    it('404 when the service does not find the procedure', async () => {
      service.start.mockRejectedValue(
        new NotFoundException('No se encontró el procedimiento'),
      );

      await http()
        .post('/api/executions')
        .set(EMPLOYEE)
        .send({ procedureId: PROCEDURE_ID })
        .expect(404);
    });
  });

  describe('GET /api/executions/:id', () => {
    it('200 with the execution', async () => {
      service.findOne.mockResolvedValue(view);

      const response = await http()
        .get(`/api/executions/${EXECUTION_ID}`)
        .set(EMPLOYEE)
        .expect(200);

      expect(response.body).toEqual(body);
      expect(service.findOne).toHaveBeenCalledWith(
        SPEC_USERS.empleadoVentas,
        EXECUTION_ID,
      );
    });

    it('400 when the id is not a UUID', async () => {
      await http().get('/api/executions/abc').set(EMPLOYEE).expect(400);

      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('404 when it is missing or belongs to someone else', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('No se encontró la ejecución'),
      );

      const response = await http()
        .get(`/api/executions/${EXECUTION_ID}`)
        .set(EMPLOYEE)
        .expect(404);

      expect(response.body.message).toBe('No se encontró la ejecución');
    });

    it('503 when a dependency is down', async () => {
      service.findOne.mockRejectedValue(
        new ServiceUnavailableException('No se pudo completar la consulta.'),
      );

      await http()
        .get(`/api/executions/${EXECUTION_ID}`)
        .set(EMPLOYEE)
        .expect(503);
    });
  });

  describe('POST /api/executions/:id/steps/:stepId/complete', () => {
    const url = `/api/executions/${EXECUTION_ID}/steps/${STEP_1}/complete`;

    it('200 with the updated execution', async () => {
      service.completeStep.mockResolvedValue(view);

      const response = await http().post(url).set(EMPLOYEE).expect(200);

      expect(response.body).toEqual(body);
      expect(service.completeStep).toHaveBeenCalledWith(
        SPEC_USERS.empleadoVentas,
        EXECUTION_ID,
        STEP_1,
      );
    });

    it.each([
      ['the execution id', `/api/executions/abc/steps/${STEP_1}/complete`],
      ['the step id', `/api/executions/${EXECUTION_ID}/steps/abc/complete`],
    ])('400 when %s is not a UUID', async (_case, badUrl) => {
      await http().post(badUrl).set(EMPLOYEE).expect(400);

      expect(service.completeStep).not.toHaveBeenCalled();
    });

    it('409 keeps the reason in the body', async () => {
      service.completeStep.mockRejectedValue(
        new ConflictException({
          statusCode: 409,
          message: 'Ese paso no es el paso actual de la ejecución',
          error: 'Conflict',
          reason: 'STEP_OUT_OF_ORDER',
        }),
      );

      const response = await http().post(url).set(EMPLOYEE).expect(409);

      expect(response.body.reason).toBe('STEP_OUT_OF_ORDER');
    });
  });

  describe('authentication and roles (class level)', () => {
    const routes: [string, () => request.Test][] = [
      [
        'POST /executions',
        () =>
          http().post('/api/executions').send({ procedureId: PROCEDURE_ID }),
      ],
      [
        'GET /executions/:id',
        () => http().get(`/api/executions/${EXECUTION_ID}`),
      ],
      [
        'POST complete',
        () =>
          http().post(
            `/api/executions/${EXECUTION_ID}/steps/${STEP_1}/complete`,
          ),
      ],
    ];

    it.each(routes)('%s: 401 without a session', async (_route, call) => {
      await call().expect(401);
    });

    it.each(routes)(
      '%s: 401 with the old simulated x-user-* headers',
      async (_route, call) => {
        await call()
          .set({
            'x-user-id': SPEC_USERS.empleadoVentas.id,
            'x-user-role': 'EMPLOYEE',
          })
          .expect(401);
        expect(service.start).not.toHaveBeenCalled();
        expect(service.findOne).not.toHaveBeenCalled();
        expect(service.completeStep).not.toHaveBeenCalled();
      },
    );

    it.each(routes)(
      '%s: 403 for ADMIN and SUPERVISOR',
      async (_route, call) => {
        for (const user of [SPEC_USERS.admin, SPEC_USERS.supervisorVentas]) {
          await call().set(bearer(user)).expect(403);
        }
        expect(service.start).not.toHaveBeenCalled();
        expect(service.findOne).not.toHaveBeenCalled();
        expect(service.completeStep).not.toHaveBeenCalled();
      },
    );
  });

  describe('Swagger', () => {
    it('documents every route with its status codes', async () => {
      const { body: doc } = await http().get('/api/docs-json').expect(200);
      const codes = (path: string, method: string) =>
        Object.keys(
          (
            doc as {
              paths: Record<string, Record<string, { responses: object }>>;
            }
          ).paths[path][method].responses,
        ).sort();

      expect(codes('/api/executions', 'post')).toEqual([
        '200',
        '201',
        '400',
        '401',
        '403',
        '404',
        '503',
      ]);
      expect(codes('/api/executions/{id}', 'get')).toEqual([
        '200',
        '400',
        '401',
        '403',
        '404',
        '503',
      ]);
      expect(
        codes('/api/executions/{id}/steps/{stepId}/complete', 'post'),
      ).toEqual(['200', '400', '401', '403', '404', '409', '503']);
    });
  });
});
