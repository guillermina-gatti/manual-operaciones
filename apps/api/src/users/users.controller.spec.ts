import { BadRequestException, INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bearer, realAuthProviders, SPEC_USERS } from '../../test/executions/real-auth';
import { configureApp } from '../app.setup';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const RESULT = [
  { id: '0b000000-0000-4000-8000-000000000001', name: 'Ana Administradora', role: 'ADMIN' },
  { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
];

describe('UsersController (HTTP, A-12)', () => {
  let app: INestApplication;
  let listOwnerCandidates: jest.Mock;

  beforeAll(async () => {
    listOwnerCandidates = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { listOwnerCandidates } },
        ...realAuthProviders(),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listOwnerCandidates.mockReset();
    listOwnerCandidates.mockResolvedValue(RESULT);
  });

  const http = () => request(app.getHttpServer());
  const admin = () => bearer(SPEC_USERS.admin);

  it('permite a ADMIN consultar candidatos con un areaIds', async () => {
    const response = await http().get(`/api/users?areaIds=${VENTAS}`).set(admin()).expect(200);
    expect(response.body).toEqual(RESULT);
    expect(listOwnerCandidates).toHaveBeenCalledWith([VENTAS]);
  });

  it('acepta areaIds repetidos y no confunde esa sintaxis con CSV', async () => {
    await http()
      .get(`/api/users?areaIds=${VENTAS}&areaIds=${OPERACIONES}&areaIds=${VENTAS}`)
      .set(admin())
      .expect(200);
    expect(listOwnerCandidates).toHaveBeenCalledWith([VENTAS, OPERACIONES, VENTAS]);
  });

  it('responde 200 [] cuando no hay candidatos', async () => {
    listOwnerCandidates.mockResolvedValue([]);
    const response = await http().get(`/api/users?areaIds=${VENTAS}`).set(admin()).expect(200);
    expect(response.body).toEqual([]);
  });

  it.each([
    ['', 'sin areaIds'],
    ['?q=ana', 'búsqueda no admitida'],
    ['?page=1', 'paginación no admitida'],
    [`?areaIds=${VENTAS}&includeInactive=true`, 'filtro extra'],
    [`?areaIds=${VENTAS},${OPERACIONES}`, 'CSV'],
    ['?areaIds=abc', 'UUID inválido'],
    ['?areaIds=', 'UUID vacío'],
    [`?areaIds=${VENTAS}&areaIds=abc`, 'uno válido y otro inválido'],
    [`?areaIds=${VENTAS}&areaIds[0]=${OPERACIONES}`, 'mezcla de formatos'],
  ])('rechaza %s (%s) con 400 sin llamar al servicio', async (query) => {
    await http().get(`/api/users${query}`).set(admin()).expect(400);
    expect(listOwnerCandidates).not.toHaveBeenCalled();
  });

  it('rechaza solicitudes sin Bearer con 401', async () => {
    await http().get(`/api/users?areaIds=${VENTAS}`).expect(401);
    expect(listOwnerCandidates).not.toHaveBeenCalled();
  });

  it('rechaza tokens falsos y cabeceras antiguas con 401', async () => {
    await http().get(`/api/users?areaIds=${VENTAS}`).set('Authorization', 'Bearer invalido').expect(401);
    await http().get(`/api/users?areaIds=${VENTAS}`).set({
      'x-user-id': SPEC_USERS.admin.id,
      'x-user-role': 'ADMIN',
    }).expect(401);
    expect(listOwnerCandidates).not.toHaveBeenCalled();
  });

  it.each([SPEC_USERS.supervisorVentas, SPEC_USERS.empleadoVentas])(
    'impide consultas al rol $role con 403',
    async (user) => {
      await http().get(`/api/users?areaIds=${VENTAS}`).set(bearer(user)).expect(403);
      expect(listOwnerCandidates).not.toHaveBeenCalled();
    },
  );

  it('propaga 400 si alguna área es inexistente o inactiva', async () => {
    listOwnerCandidates.mockRejectedValue(new BadRequestException('Área inválida'));
    await http().get(`/api/users?areaIds=${VENTAS}`).set(admin()).expect(400);
  });

  it('propaga 503 del servicio sin convertirlo en lista vacía', async () => {
    listOwnerCandidates.mockRejectedValue(new ServiceUnavailableException('Base indisponible'));
    await http().get(`/api/users?areaIds=${VENTAS}`).set(admin()).expect(503);
  });

  it('documenta en Swagger los estados esperados', async () => {
    const { body: doc } = await http().get('/api/docs-json').expect(200);
    const paths = (doc as { paths: Record<string, Record<string, { responses: object }>> }).paths;
    expect(Object.keys(paths['/api/users'].get.responses).sort()).toEqual([
      '200', '400', '401', '403', '503',
    ]);
  });
});
