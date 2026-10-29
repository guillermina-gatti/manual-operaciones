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
import { ProcedureDraftService } from './procedure-draft.service';
import { ProceduresController } from './procedures.controller';
import type {
  ProcedureRecord,
  StepRecord,
  VersionRecord,
} from './procedures.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000001';
const STEP_ID = '1c000000-0000-4000-8000-000000000001';
const OTHER_STEP_ID = '1c000000-0000-4000-8000-000000000002';
const ADMIN_ID = SPEC_USERS.admin.id;
const T0 = new Date('2026-10-27T10:00:00.000Z');

const ADMIN = bearer(SPEC_USERS.admin);
const SUPERVISOR = bearer(SPEC_USERS.supervisorVentas);
const EMPLOYEE = bearer(SPEC_USERS.empleadoVentas);
const ADMIN_USER = SPEC_USERS.admin; // what the real guard leaves in request.user

const version: VersionRecord = {
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  versionNumber: 1,
  status: 'DRAFT',
  title: 'Cierre de caja',
  description: null,
  createdById: ADMIN_ID,
  createdAt: T0,
  updatedAt: T0,
  stepCount: 0,
};
const procedure: ProcedureRecord = {
  id: PROCEDURE_ID,
  ownerId: ADMIN_ID,
  createdAt: T0,
  updatedAt: T0,
  areaIds: [],
  versions: [version],
};
const step: StepRecord = {
  id: STEP_ID,
  procedureVersionId: VERSION_ID,
  order: 1,
  title: 'Contar el efectivo',
  description: '',
};

const base = `/api/procedures/${PROCEDURE_ID}/versions/${VERSION_ID}`;

describe('ProceduresController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: Record<
    | 'create'
    | 'createDraft'
    | 'update'
    | 'remove'
    | 'addStep'
    | 'updateStep'
    | 'removeStep'
    | 'reorderSteps',
    jest.Mock
  >;

  beforeAll(async () => {
    service = {
      create: jest.fn(),
      createDraft: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      addStep: jest.fn(),
      updateStep: jest.fn(),
      removeStep: jest.fn(),
      reorderSteps: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProceduresController],
      providers: [
        { provide: ProcedureDraftService, useValue: service },
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

  describe('success responses', () => {
    it('POST /procedures: 201 with the procedure, without ownerId', async () => {
      service.create.mockResolvedValue(procedure);

      const response = await http()
        .post('/api/procedures')
        .set(ADMIN)
        .send({ title: 'Cierre de caja' })
        .expect(201);

      expect(service.create).toHaveBeenCalledWith(ADMIN_USER, {
        title: 'Cierre de caja',
      });
      expect(response.body).toMatchObject({
        id: PROCEDURE_ID,
        areaIds: [],
        versions: [{ id: VERSION_ID, status: 'DRAFT', stepCount: 0 }],
      });
      expect(JSON.stringify(response.body)).not.toContain('ownerId');
      expect(JSON.stringify(response.body)).not.toContain('createdById');
    });

    it('POST /procedures/:id/versions: 201 with the new draft', async () => {
      service.createDraft.mockResolvedValue({ ...version, versionNumber: 2 });

      const response = await http()
        .post(`/api/procedures/${PROCEDURE_ID}/versions`)
        .set(ADMIN)
        .expect(201);

      expect(service.createDraft).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
      );
      expect(response.body).toMatchObject({
        versionNumber: 2,
        status: 'DRAFT',
      });
    });

    it('PATCH version: 200 with the version', async () => {
      service.update.mockResolvedValue({ ...version, title: 'Nuevo' });

      const response = await http()
        .patch(base)
        .set(ADMIN)
        .send({ title: 'Nuevo' })
        .expect(200);

      expect(service.update).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
        VERSION_ID,
        { title: 'Nuevo' },
      );
      expect(response.body.title).toBe('Nuevo');
    });

    it('DELETE version: 204 without a body', async () => {
      service.remove.mockResolvedValue(undefined);

      const response = await http().delete(base).set(ADMIN).expect(204);

      expect(service.remove).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
        VERSION_ID,
      );
      expect(response.text).toBe('');
    });

    it('POST steps: 201 with the step', async () => {
      service.addStep.mockResolvedValue(step);

      const response = await http()
        .post(`${base}/steps`)
        .set(ADMIN)
        .send({ title: 'Contar el efectivo', position: 1 })
        .expect(201);

      expect(service.addStep).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
        VERSION_ID,
        { title: 'Contar el efectivo', position: 1 },
      );
      expect(response.body).toEqual(step);
    });

    it('PATCH step: 200 with the step', async () => {
      service.updateStep.mockResolvedValue({ ...step, title: 'Nuevo' });

      const response = await http()
        .patch(`${base}/steps/${STEP_ID}`)
        .set(ADMIN)
        .send({ title: 'Nuevo' })
        .expect(200);

      expect(service.updateStep).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
        VERSION_ID,
        STEP_ID,
        { title: 'Nuevo' },
      );
      expect(response.body.title).toBe('Nuevo');
    });

    it('DELETE step: 204 without a body', async () => {
      service.removeStep.mockResolvedValue(undefined);

      await http().delete(`${base}/steps/${STEP_ID}`).set(ADMIN).expect(204);

      expect(service.removeStep).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
        VERSION_ID,
        STEP_ID,
      );
    });

    it('PUT steps/order: 200 with the steps in the new order', async () => {
      service.reorderSteps.mockResolvedValue([
        { ...step, id: OTHER_STEP_ID, order: 1 },
        { ...step, order: 2 },
      ]);

      const response = await http()
        .put(`${base}/steps/order`)
        .set(ADMIN)
        .send({ stepIds: [OTHER_STEP_ID, STEP_ID] })
        .expect(200);

      expect(service.reorderSteps).toHaveBeenCalledWith(
        ADMIN_USER,
        PROCEDURE_ID,
        VERSION_ID,
        { stepIds: [OTHER_STEP_ID, STEP_ID] },
      );
      expect(response.body.map((s: StepRecord) => [s.id, s.order])).toEqual([
        [OTHER_STEP_ID, 1],
        [STEP_ID, 2],
      ]);
    });
  });

  const routes: [string, string, string, object?][] = [
    ['POST', 'create procedure', '/api/procedures', { title: 'X' }],
    ['POST', 'new draft', `/api/procedures/${PROCEDURE_ID}/versions`],
    ['PATCH', 'edit version', base, { title: 'X' }],
    ['DELETE', 'delete version', base],
    ['POST', 'add step', `${base}/steps`, { title: 'X' }],
    ['PATCH', 'edit step', `${base}/steps/${STEP_ID}`, { title: 'X' }],
    ['DELETE', 'delete step', `${base}/steps/${STEP_ID}`],
    ['PUT', 'reorder steps', `${base}/steps/order`, { stepIds: [STEP_ID] }],
  ];
  const send = (method: string, path: string, body?: object) =>
    http()[method.toLowerCase() as 'post'](path).send(body);

  describe.each(routes)('%s %s', (method, _name, path, body) => {
    it('R1: 401 without a session and the service is not called', async () => {
      await send(method, path, body).expect(401);
      for (const fn of Object.values(service))
        expect(fn).not.toHaveBeenCalled();
    });

    it('R1: 401 with the old simulated x-user-* headers and the service is not called', async () => {
      await send(method, path, body)
        .set({
          'x-user-id': SPEC_USERS.admin.id,
          'x-user-role': 'ADMIN',
        })
        .expect(401);
      for (const fn of Object.values(service))
        expect(fn).not.toHaveBeenCalled();
    });

    it.each([
      ['SUPERVISOR', SUPERVISOR],
      ['EMPLOYEE', EMPLOYEE],
    ])(
      'R1: 403 for a %s and the service is not called',
      async (_role, headers) => {
        await send(method, path, body).set(headers).expect(403);
        for (const fn of Object.values(service))
          expect(fn).not.toHaveBeenCalled();
      },
    );
  });

  describe('input checks, before the service', () => {
    it.each([
      ['edit version', 'patch', 'procedures/x/versions/y'],
      ['add step', 'post', `procedures/${PROCEDURE_ID}/versions/y/steps`],
      [
        'delete step',
        'delete',
        `procedures/${PROCEDURE_ID}/versions/${VERSION_ID}/steps/z`,
      ],
    ] as const)(
      '400 for an id that is not a UUID (%s)',
      async (_n, method, path) => {
        await http()
          [method](`/api/${path}`)
          .set(ADMIN)
          .send({ title: 'X' })
          .expect(400);
        for (const fn of Object.values(service))
          expect(fn).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['no title', {}],
      ['an empty title', { title: '   ' }],
      ['an extra property', { title: 'X', ownerId: ADMIN_ID }],
    ])('400 creating a procedure with %s', async (_case, payload) => {
      await http().post('/api/procedures').set(ADMIN).send(payload).expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('400 reordering with ids that are not UUIDs', async () => {
      await http()
        .put(`${base}/steps/order`)
        .set(ADMIN)
        .send({ stepIds: ['uno', 'dos'] })
        .expect(400);
      expect(service.reorderSteps).not.toHaveBeenCalled();
    });
  });

  describe('errors of the service reach the response unchanged', () => {
    it('404', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('No se encontró el procedimiento'),
      );

      const response = await http()
        .patch(base)
        .set(ADMIN)
        .send({ title: 'X' })
        .expect(404);

      expect(response.body.message).toBe('No se encontró el procedimiento');
    });

    it('409 keeps its reason', async () => {
      service.addStep.mockRejectedValue(
        new ConflictException({
          statusCode: 409,
          message: 'Un borrador admite hasta 50 pasos',
          error: 'Conflict',
          reason: 'STEP_LIMIT_REACHED',
        }),
      );

      const response = await http()
        .post(`${base}/steps`)
        .set(ADMIN)
        .send({ title: 'X' })
        .expect(409);

      expect(response.body.reason).toBe('STEP_LIMIT_REACHED');
    });

    it('503', async () => {
      service.create.mockRejectedValue(
        new ServiceUnavailableException('caída'),
      );

      await http()
        .post('/api/procedures')
        .set(ADMIN)
        .send({ title: 'X' })
        .expect(503);
    });
  });

  describe('Swagger', () => {
    it('lists the 8 routes with the codes of the plan', async () => {
      const { body: doc } = await http().get('/api/docs-json').expect(200);

      const codes = (path: string, method: string) =>
        Object.keys(doc.paths[path][method].responses);
      expect(
        Object.keys(doc.paths).filter((p) => p.startsWith('/api/procedures')),
      ).toHaveLength(6);
      expect(codes('/api/procedures', 'post')).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '503']),
      );
      expect(codes('/api/procedures/{id}/versions', 'post')).toEqual(
        expect.arrayContaining(['201', '404', '409']),
      );
      expect(
        codes('/api/procedures/{id}/versions/{versionId}', 'delete'),
      ).toEqual(expect.arrayContaining(['204', '404', '409']));
      expect(
        codes('/api/procedures/{id}/versions/{versionId}/steps/order', 'put'),
      ).toEqual(expect.arrayContaining(['200', '400', '404', '409']));
    });

    it('documents the Bearer token on every operation and no x-user-* header', async () => {
      const { body: doc } = await http().get('/api/docs-json').expect(200);

      const operations = Object.entries(doc.paths)
        .filter(([path]) => path.startsWith('/api/procedures'))
        .flatMap(([, methods]) => Object.values(methods as object));
      expect(operations).toHaveLength(8);
      for (const operation of operations) {
        expect(operation.security).toEqual([{ bearer: [] }]);
        const headers = (operation.parameters ?? []).filter(
          (p: { in: string }) => p.in === 'header',
        );
        expect(headers).toEqual([]);
      }
    });
  });
});
