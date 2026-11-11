import { INestApplication, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bearer, realAuthProviders, SPEC_USERS } from '../../test/executions/real-auth';
import { AREAS, ID, T0, version } from '../../test/procedures/view-fixtures';
import { configureApp } from '../app.setup';
import { ProcedureViewController } from './procedure-view.controller';
import { ProcedureViewService } from './procedure-view.service';

const EMPLOYEE_USER = SPEC_USERS.empleadoVentas; // what the real guard leaves in request.user
const EMPLOYEE = bearer(SPEC_USERS.empleadoVentas);
const SUPERVISOR = bearer(SPEC_USERS.supervisorVentas);
const ADMIN = bearer(SPEC_USERS.admin);

const shown = (({ id, versionNumber, status, title, description, stepCount }) => ({
  id,
  versionNumber,
  status,
  title,
  description,
  stepCount,
}))(version(2, 'PUBLISHED'));

describe('ProcedureViewController (HTTP, service mocked)', () => {
  let app: INestApplication;
  let service: Record<'list' | 'get', jest.Mock>;

  beforeAll(async () => {
    service = { list: jest.fn(), get: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcedureViewController],
      providers: [{ provide: ProcedureViewService, useValue: service }, ...realAuthProviders()],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.resetAllMocks());

  const http = () => request(app.getHttpServer());

  it('R16: GET /procedures answers 200 with { data, total, page, limit }, with the defaults', async () => {
    service.list.mockResolvedValue({
      data: [{ id: ID, createdAt: T0, shown, areas: AREAS }],
      total: 1,
    });

    const response = await http().get('/api/procedures').set(EMPLOYEE).expect(200);

    expect(service.list).toHaveBeenCalledWith(EMPLOYEE_USER, 1, 20);
    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(response.body.data[0]).toMatchObject({ id: ID, version: shown, areas: AREAS });
  });

  it('R16: reads page and limit from the URL as numbers', async () => {
    service.list.mockResolvedValue({ data: [], total: 0 });

    const response = await http().get('/api/procedures?page=2&limit=5').set(SUPERVISOR).expect(200);

    expect(response.body).toMatchObject({ page: 2, limit: 5 });
  });

  it.each(['limit=101', 'limit=0', 'page=0', 'page=abc', 'limit=1.5'])(
    'E26: %s is a 400 and the service is not called',
    async (query) => {
      await http().get(`/api/procedures?${query}`).set(EMPLOYEE).expect(400);

      expect(service.list).not.toHaveBeenCalled();
    },
  );

  it('R13: GET /procedures/:id answers 200 with the version and its steps, for any role', async () => {
    service.get.mockResolvedValue({
      id: ID,
      createdAt: T0,
      areas: AREAS,
      version: { ...shown, steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }] },
    });

    const response = await http().get(`/api/procedures/${ID}`).set(EMPLOYEE).expect(200);

    expect(service.get).toHaveBeenCalledWith(EMPLOYEE_USER, ID);
    expect(response.body.version.steps).toHaveLength(1);
    expect(response.body.createdAt).toBe('2026-11-01T10:00:00.000Z');
  });

  it('an id that is not a UUID is a 400', async () => {
    await http().get('/api/procedures/no-es-uuid').set(ADMIN).expect(400);

    expect(service.get).not.toHaveBeenCalled();
  });

  it('R14: the 404 and the 503 of the service go out as they are', async () => {
    service.get.mockRejectedValueOnce(new NotFoundException('No se encontró el procedimiento'));
    service.list.mockRejectedValueOnce(new ServiceUnavailableException('No se pudo'));

    const missing = await http().get(`/api/procedures/${ID}`).set(EMPLOYEE).expect(404);
    await http().get('/api/procedures').set(EMPLOYEE).expect(503);

    expect(missing.body.message).toBe('No se encontró el procedimiento');
  });

  it('401: without a session', async () => {
    await http().get('/api/procedures').expect(401);
    await http().get(`/api/procedures/${ID}`).expect(401);
  });
});
