import {
  ConflictException,
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bearer, realAuthProviders, SPEC_USERS } from '../../test/executions/real-auth';
import {
  PROCEDURE_ID,
  VERSION_ID,
  detail as detailRecord,
  record as historyRecord,
} from '../../test/procedures/version-fixtures';
import { configureApp } from '../app.setup';
import { ProcedureHistoryService } from './procedure-history.service';
import { ProcedurePublishService } from './procedure-publish.service';
import { ProcedureVersionsController } from './procedure-versions.controller';

const ADMIN_USER = SPEC_USERS.admin; // what the real guard leaves in request.user
const ADMIN = bearer(SPEC_USERS.admin);
const SUPERVISOR = bearer(SPEC_USERS.supervisorVentas);
const EMPLOYEE = bearer(SPEC_USERS.empleadoVentas);

// What the services give: the record with the name of who published it.
const record = () => ({ ...historyRecord({ stepCount: 1 }), publishedByName: 'Ana Administradora' });
const detail = {
  ...detailRecord({ status: 'SUPERSEDED', description: 'Al final del turno' }),
  publishedByName: 'Ana Administradora',
};

const base = `/api/procedures/${PROCEDURE_ID}/versions`;
const publishUrl = `${base}/${VERSION_ID}/publish`;

describe('ProcedureVersionsController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: Record<'publish' | 'list' | 'getVersion', jest.Mock>;

  beforeAll(async () => {
    service = { publish: jest.fn(), list: jest.fn(), getVersion: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcedureVersionsController],
      providers: [
        { provide: ProcedurePublishService, useValue: { publish: service.publish } },
        { provide: ProcedureHistoryService, useValue: { list: service.list, getVersion: service.getVersion } },
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
    it('R2: POST …/publish answers 200 with the version, who published it and when, without internal fields', async () => {
      service.publish.mockResolvedValue(record());

      const response = await http().post(publishUrl).set(ADMIN).send({}).expect(200);

      expect(response.body).toEqual({
        id: VERSION_ID,
        procedureId: PROCEDURE_ID,
        versionNumber: 2,
        status: 'PUBLISHED',
        title: 'Cierre de caja',
        createdAt: '2026-11-01T10:00:00.000Z',
        publishedAt: '2026-11-10T12:00:00.000Z',
        publishedBy: { id: ADMIN_USER.id, name: 'Ana Administradora' },
        isCritical: false,
        changeSummary: null,
        stepCount: 1,
      });
    });

    it('R2: publishes without a body (D8) and passes the body when there is one', async () => {
      service.publish.mockResolvedValue(record());

      await http().post(publishUrl).set(ADMIN).expect(200);
      await http()
        .post(publishUrl)
        .set(ADMIN)
        .send({ isCritical: true, changeSummary: 'Cambia el límite' })
        .expect(200);

      expect(service.publish).toHaveBeenNthCalledWith(1, ADMIN_USER, PROCEDURE_ID, VERSION_ID, {});
      expect(service.publish).toHaveBeenNthCalledWith(2, ADMIN_USER, PROCEDURE_ID, VERSION_ID, {
        isCritical: true,
        changeSummary: 'Cambia el límite',
      });
    });

    it('R8: GET …/versions answers 200 with { data, total, page, limit }, with the defaults', async () => {
      service.list.mockResolvedValue({ data: [record()], total: 1 });

      const response = await http().get(base).set(ADMIN).expect(200);

      expect(service.list).toHaveBeenCalledWith(ADMIN_USER, PROCEDURE_ID, 1, 20);
      expect(response.body).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(response.body.data).toHaveLength(1);
    });

    it('R8: reads page and limit from the URL as numbers', async () => {
      service.list.mockResolvedValue({ data: [], total: 0 });

      const response = await http().get(`${base}?page=2&limit=5`).set(ADMIN).expect(200);

      expect(service.list).toHaveBeenCalledWith(ADMIN_USER, PROCEDURE_ID, 2, 5);
      expect(response.body).toMatchObject({ page: 2, limit: 5 });
    });

    it('R9: GET …/versions/:versionId answers 200 with the version and its steps', async () => {
      service.getVersion.mockResolvedValue(detail);

      const response = await http().get(`${base}/${VERSION_ID}`).set(ADMIN).expect(200);

      expect(service.getVersion).toHaveBeenCalledWith(ADMIN_USER, PROCEDURE_ID, VERSION_ID);
      expect(response.body).toMatchObject({
        status: 'SUPERSEDED',
        description: 'Al final del turno',
        steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }],
      });
    });
  });

  describe('R1: without a session or with another role', () => {
    const routes: [string, 'post' | 'get', string][] = [
      ['publish', 'post', publishUrl],
      ['history', 'get', base],
      ['detail', 'get', `${base}/${VERSION_ID}`],
    ];

    it.each(routes)('%s: 401 without a session', async (_name, method, url) => {
      await http()[method](url).expect(401);

      expect(service.publish).not.toHaveBeenCalled();
      expect(service.list).not.toHaveBeenCalled();
      expect(service.getVersion).not.toHaveBeenCalled();
    });

    it.each(routes)('%s: 403 for a SUPERVISOR and an EMPLOYEE', async (_name, method, url) => {
      await http()[method](url).set(SUPERVISOR).expect(403);
      await http()[method](url).set(EMPLOYEE).expect(403);

      expect(service.publish).not.toHaveBeenCalled();
      expect(service.list).not.toHaveBeenCalled();
      expect(service.getVersion).not.toHaveBeenCalled();
    });
  });

  describe('R13: invalid data is a 400 and nothing reaches the service', () => {
    it.each([
      ['an id that is not a UUID', '/api/procedures/xyz/versions/' + VERSION_ID + '/publish', {}],
      ['a versionId that is not a UUID', `${base}/xyz/publish`, {}],
      ['isCritical that is not a boolean', publishUrl, { isCritical: 'yes' }],
      ['a summary of 301 characters', publishUrl, { changeSummary: 'a'.repeat(301) }],
      ['a field that does not exist', publishUrl, { publishedById: ADMIN_USER.id }],
    ])('publish with %s', async (_case, url, body) => {
      await http().post(url).set(ADMIN).send(body).expect(400);

      expect(service.publish).not.toHaveBeenCalled();
    });

    it('history with limit=101 or a page that is not a number', async () => {
      await http().get(`${base}?limit=101`).set(ADMIN).expect(400);
      await http().get(`${base}?page=abc`).set(ADMIN).expect(400);

      expect(service.list).not.toHaveBeenCalled();
    });

    it('detail with a versionId that is not a UUID', async () => {
      await http().get(`${base}/xyz`).set(ADMIN).expect(400);

      expect(service.getVersion).not.toHaveBeenCalled();
    });
  });

  describe('errors of the service leave as they are', () => {
    it('R3: a 404, a 409 with its reason and a 503', async () => {
      service.publish
        .mockRejectedValueOnce(new NotFoundException('No se encontró el procedimiento'))
        .mockRejectedValueOnce(
          new ConflictException({
            statusCode: 409,
            message: 'No se puede publicar una versión sin pasos',
            error: 'Conflict',
            reason: 'NO_STEPS',
          }),
        )
        .mockRejectedValueOnce(new ServiceUnavailableException('No se pudo completar'));

      await http().post(publishUrl).set(ADMIN).send({}).expect(404);
      const conflict = await http().post(publishUrl).set(ADMIN).send({}).expect(409);
      await http().post(publishUrl).set(ADMIN).send({}).expect(503);

      expect(conflict.body).toMatchObject({ reason: 'NO_STEPS' });
    });
  });
});
