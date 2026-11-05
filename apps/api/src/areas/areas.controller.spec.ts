import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bearer, realAuthProviders, SPEC_USERS } from '../../test/executions/real-auth';
import { configureApp } from '../app.setup';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

const CATALOG = [
  { id: '0a000000-0000-4000-8000-000000000002', name: 'Operaciones', isActive: false },
  { id: '0a000000-0000-4000-8000-000000000001', name: 'Ventas', isActive: true },
];

describe('AreasController (HTTP, A-11)', () => {
  let app: INestApplication;
  let list: jest.Mock;

  beforeAll(async () => {
    list = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [AreasController],
      providers: [
        { provide: AreasService, useValue: { list } },
        ...realAuthProviders(), // JWT real + usuarios autenticados desde DB simulada
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
    list.mockReset();
    list.mockResolvedValue(CATALOG);
  });

  const http = () => request(app.getHttpServer());

  it.each([SPEC_USERS.admin, SPEC_USERS.supervisorVentas, SPEC_USERS.empleadoVentas])(
    'permite consultar el mismo catálogo al rol $role',
    async (user) => {
      const response = await http().get('/api/areas').set(bearer(user)).expect(200);
      expect(response.body).toEqual(CATALOG);
      expect(list).toHaveBeenCalledTimes(1);
    },
  );

  it('con catálogo vacío responde 200 y []', async () => {
    list.mockResolvedValue([]);
    const response = await http().get('/api/areas').set(bearer(SPEC_USERS.admin)).expect(200);
    expect(response.body).toEqual([]);
  });

  it.each(['?includeInactive=true', '?active=false', '?q=Ventas'])(
    'rechaza parámetros de consulta no admitidos (%s)',
    async (query) => {
      await http().get(`/api/areas${query}`).set(bearer(SPEC_USERS.admin)).expect(400);
      expect(list).not.toHaveBeenCalled();
    },
  );

  it('sin Bearer devuelve 401 sin consultar los datos', async () => {
    await http().get('/api/areas').expect(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('no acepta tokens falsos ni cabeceras antiguas de usuario simulado', async () => {
    await http().get('/api/areas').set('Authorization', 'Bearer invalido').expect(401);
    await http().get('/api/areas').set({
      'x-user-id': SPEC_USERS.empleadoVentas.id,
      'x-user-role': 'EMPLOYEE',
    }).expect(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('muestra 503 si el servicio reporta indisponibilidad', async () => {
    list.mockRejectedValue(new ServiceUnavailableException('Base indisponible'));
    await http().get('/api/areas').set(bearer(SPEC_USERS.admin)).expect(503);
  });

  it('publica el esquema HTTP y los códigos esperados en Swagger', async () => {
    const { body: doc } = await http().get('/api/docs-json').expect(200);
    const paths = (doc as { paths: Record<string, Record<string, { responses: object }>> }).paths;
    expect(Object.keys(paths['/api/areas'].get.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '503',
    ]);
  });
});
