import {
  BadRequestException,
  ConflictException,
  INestApplication,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bearer, realAuthProviders, SPEC_USERS } from '../../test/executions/real-auth';
import { configureApp } from '../app.setup';
import {
  InvitationDeliveryService,
  LocalInvitationDeliveryService,
} from './invitation-delivery.service';
import { InvitationsService } from './invitations.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const RESULT = [
  { id: '0b000000-0000-4000-8000-000000000001', name: 'Ana Administradora', role: 'ADMIN' },
  { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
];

const SAMPLE_RAW_TOKEN = 'V1StGXR8_Z5jdHi6B-myTEYWgkUVnxI4463m48EEUIU';
const SAMPLE_INVITATION = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'nuevo@empresa.com',
  role: 'EMPLOYEE' as const,
  areaIds: [VENTAS],
  expiresAt: new Date('2026-11-07T12:00:00.000Z'),
  createdAt: new Date('2026-11-05T12:00:00.000Z'),
  createdById: SPEC_USERS.admin.id,
};

const SPEC_JWT_SECRET = 'executions-controller-spec-secret';

describe('UsersController (HTTP, A-12 y HU29)', () => {
  let app: INestApplication;
  let listOwnerCandidates: jest.Mock;
  let createInvitation: jest.Mock;
  let revokeInvitation: jest.Mock;
  let listInvitations: jest.Mock;
  let assertReady: jest.Mock;
  let deliver: jest.Mock;
  let configGet: jest.Mock;

  beforeAll(async () => {
    listOwnerCandidates = jest.fn();
    createInvitation = jest.fn();
    revokeInvitation = jest.fn();
    listInvitations = jest.fn();
    assertReady = jest.fn();
    deliver = jest.fn();
    configGet = jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
      if (key === 'FRONTEND_URL') return 'http://localhost:3001';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { listOwnerCandidates } },
        {
          provide: InvitationsService,
          useValue: { createInvitation, revokeInvitation, listInvitations },
        },
        {
          provide: InvitationDeliveryService,
          useValue: { assertReady, deliver },
        },
        ...realAuthProviders(),
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
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

    createInvitation.mockReset();
    createInvitation.mockResolvedValue({
      invitation: { ...SAMPLE_INVITATION },
      rawToken: SAMPLE_RAW_TOKEN,
    });

    revokeInvitation.mockReset();
    revokeInvitation.mockResolvedValue(true);

    listInvitations.mockReset();
    listInvitations.mockResolvedValue([]);

    assertReady.mockReset();

    deliver.mockReset();
    deliver.mockImplementation(async (params: { invitationUrl: string }) => ({
      delivered: false,
      channel: 'local',
      invitationUrl: params.invitationUrl,
    }));

    configGet.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
      if (key === 'FRONTEND_URL') return 'http://localhost:3001';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    });
  });

  const http = () => request(app.getHttpServer());
  const admin = () => bearer(SPEC_USERS.admin);

  describe('GET /api/users', () => {
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
  });

  describe('POST /api/users/invitations (HU29)', () => {
    it('permite a ADMIN crear una invitación válidamente y devuelve 201', async () => {
      const payload = {
        email: 'nuevo@empresa.com',
        role: 'EMPLOYEE',
        areaIds: [VENTAS],
      };

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send(payload)
        .expect(201);

      expect(response.body).toEqual({
        id: SAMPLE_INVITATION.id,
        email: SAMPLE_INVITATION.email,
        role: SAMPLE_INVITATION.role,
        areaIds: SAMPLE_INVITATION.areaIds,
        expiresAt: SAMPLE_INVITATION.expiresAt.toISOString(),
        createdAt: SAMPLE_INVITATION.createdAt.toISOString(),
        invitationUrl: `http://localhost:3001/registro#token=${SAMPLE_RAW_TOKEN}`,
      });

      expect(assertReady).toHaveBeenCalled();
      expect(createInvitation).toHaveBeenCalledWith({
        email: 'nuevo@empresa.com',
        role: 'EMPLOYEE',
        areaIds: [VENTAS],
        createdById: SPEC_USERS.admin.id,
      });
      expect(deliver).toHaveBeenCalledWith({
        email: 'nuevo@empresa.com',
        role: 'EMPLOYEE',
        token: SAMPLE_RAW_TOKEN,
        invitationUrl: `http://localhost:3001/registro#token=${SAMPLE_RAW_TOKEN}`,
      });
    });

    it('utiliza siempre el ID del administrador autenticado como createdById ignorando cualquier valor provisto', async () => {
      const payload = {
        email: 'nuevo@empresa.com',
        role: 'EMPLOYEE',
        areaIds: [VENTAS],
        createdById: '00000000-0000-0000-0000-000000000000',
      };

      // ValidationPipe con forbidNonWhitelisted rechaza campos no permitidos en el DTO
      await http()
        .post('/api/users/invitations')
        .set(admin())
        .send(payload)
        .expect(400);

      expect(createInvitation).not.toHaveBeenCalled();
    });

    it('normaliza el email a minúsculas y elimina espacios circundantes', async () => {
      const payload = {
        email: '   Nuevo.Usuario@Empresa.COM   ',
        role: 'EMPLOYEE',
        areaIds: [VENTAS],
      };

      await http()
        .post('/api/users/invitations')
        .set(admin())
        .send(payload)
        .expect(201);

      expect(createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'nuevo.usuario@empresa.com',
        }),
      );
    });

    it('permite crear invitaciones de rol ADMIN sin áreas', async () => {
      createInvitation.mockResolvedValueOnce({
        invitation: {
          ...SAMPLE_INVITATION,
          role: 'ADMIN',
          areaIds: [],
        },
        rawToken: SAMPLE_RAW_TOKEN,
      });

      const payload = {
        email: 'admin.nuevo@empresa.com',
        role: 'ADMIN',
      };

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send(payload)
        .expect(201);

      expect(response.body.role).toBe('ADMIN');
      expect(response.body.areaIds).toEqual([]);
      expect(createInvitation).toHaveBeenCalledWith({
        email: 'admin.nuevo@empresa.com',
        role: 'ADMIN',
        areaIds: [],
        createdById: SPEC_USERS.admin.id,
      });
    });

    it('rechaza solicitudes sin autenticación con 401', async () => {
      await http()
        .post('/api/users/invitations')
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(401);

      expect(createInvitation).not.toHaveBeenCalled();
    });

    it.each([SPEC_USERS.supervisorVentas, SPEC_USERS.empleadoVentas])(
      'rechaza solicitudes del rol $role con 403',
      async (user) => {
        await http()
          .post('/api/users/invitations')
          .set(bearer(user))
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(403);

        expect(createInvitation).not.toHaveBeenCalled();
      },
    );

    it.each([
      [{ role: 'EMPLOYEE', areaIds: [VENTAS] }, 'email ausente'],
      [{ email: 'invalido', role: 'EMPLOYEE', areaIds: [VENTAS] }, 'email sin formato válido'],
      [{ email: 'nuevo@empresa.com', areaIds: [VENTAS] }, 'rol ausente'],
      [{ email: 'nuevo@empresa.com', role: 'SUPERUSER', areaIds: [VENTAS] }, 'rol inexistente'],
      [{ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: ['invalido-uuid'] }, 'área no UUID v4'],
      [{ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: 'no-es-array' }, 'área no array'],
    ])('rechaza DTO inválido (%s) con 400 sin invocar el servicio', async (payload, _description) => {
      await http()
        .post('/api/users/invitations')
        .set(admin())
        .send(payload)
        .expect(400);

      expect(createInvitation).not.toHaveBeenCalled();
    });

    it('propaga 400 de InvitationsService si EMPLOYEE carece de áreas', async () => {
      createInvitation.mockRejectedValueOnce(
        new BadRequestException('Se requiere al menos un área para este rol'),
      );

      await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE' })
        .expect(400);
    });

    it('propaga 409 de InvitationsService si el usuario o invitación activa ya existe', async () => {
      createInvitation.mockRejectedValueOnce(
        new ConflictException('El correo ya pertenece a un usuario registrado'),
      );

      await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(409);
    });

    it('construye la invitationUrl con fragmento #token= y no con parámetro de consulta ?token=', async () => {
      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(201);

      expect(response.body.invitationUrl).toContain('/registro#token=');
      expect(response.body.invitationUrl).not.toContain('?token=');
    });

    it('construye invitationUrl exclusivamente a partir de FRONTEND_URL configurado y nunca del Host header', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
        if (key === 'FRONTEND_URL') return 'https://front.empresa.com';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .set('Host', 'atacante.com')
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(201);

      expect(response.body.invitationUrl).toMatch(
        /^https:\/\/front\.empresa\.com\/registro#token=/,
      );
      expect(response.body.invitationUrl).not.toContain('atacante.com');
    });

    it('en desarrollo/test utiliza el fallback http://localhost:3001 si FRONTEND_URL no está configurada', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(201);

      expect(response.body.invitationUrl).toMatch(
        /^http:\/\/localhost:3001\/registro#token=/,
      );
    });

    it('en staging o producción sin proveedor configurado responde 503 y cero llamadas a createInvitation', async () => {
      // Simula el comportamiento de LocalInvitationDeliveryService.assertReady() en staging/producción
      assertReady.mockImplementationOnce(() => {
        throw new ServiceUnavailableException(
          'El servicio de entrega de invitaciones no está configurado en este entorno',
        );
      });

      configGet.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
        if (key === 'FRONTEND_URL') return 'https://front.empresa.com';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(503);

      expect(response.body.message).toBe(
        'El servicio de entrega de invitaciones no está configurado en este entorno',
      );
      expect(createInvitation).not.toHaveBeenCalled();
    });

    it('en staging sin proveedor configurado responde 503 y cero llamadas a createInvitation', async () => {
      assertReady.mockImplementationOnce(() => {
        throw new ServiceUnavailableException(
          'El servicio de entrega de invitaciones no está configurado en este entorno',
        );
      });

      configGet.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
        if (key === 'FRONTEND_URL') return 'https://staging.empresa.com';
        if (key === 'NODE_ENV') return 'staging';
        return undefined;
      });

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(503);

      expect(response.body.message).toBe(
        'El servicio de entrega de invitaciones no está configurado en este entorno',
      );
      expect(createInvitation).not.toHaveBeenCalled();
    });

    it('en producción con proveedor simulado disponible omite invitationUrl, token y tokenHash de la respuesta', async () => {
      // NOTA: Esta prueba simula la presencia de un proveedor de entrega disponible (assertReady exitoso y deliver por email)
      // para verificar que el controlador en producción nunca expone el token ni la URL en el payload HTTP.
      // No representa ni prueba la integración con un proveedor de transporte externo real.
      configGet.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
        if (key === 'FRONTEND_URL') return 'https://front.empresa.com';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      deliver.mockResolvedValueOnce({
        delivered: true,
        channel: 'email',
      });

      const response = await http()
        .post('/api/users/invitations')
        .set(admin())
        .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
        .expect(201);

      expect(response.body.invitationUrl).toBeUndefined();
      expect(response.body.token).toBeUndefined();
      expect(response.body.tokenHash).toBeUndefined();
      expect(response.body.id).toBe(SAMPLE_INVITATION.id);
      expect(createInvitation).toHaveBeenCalled();
    });

    describe('Validación estricta de FRONTEND_URL', () => {
      it.each([
        ['http://front.empresa.com', 'protocolo http no permitido en producción'],
        ['https://usuario:password@front.empresa.com', 'credenciales incluidas'],
        ['https://front.empresa.com?param=1', 'query string incluido'],
        ['https://front.empresa.com?', 'delimitador ? vacío sin parámetros'],
        ['https://front.empresa.com#seccion', 'fragmento incluido'],
        ['https://front.empresa.com#', 'delimitador # vacío sin fragmento'],
        ['invalida-no-url', 'URL no absoluta'],
        ['ftp://front.empresa.com', 'protocolo no permitido (ftp)'],
        ['javascript:alert(1)', 'protocolo no permitido (javascript)'],
        [undefined, 'variable ausente'],
        ['   ', 'variable vacía'],
      ])('en producción con proveedor simulado rechaza FRONTEND_URL %s (%s) con 503 sin crear la invitación', async (frontendUrl, _desc) => {
        configGet.mockImplementation((key: string) => {
          if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
          if (key === 'FRONTEND_URL') return frontendUrl;
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        });

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(createInvitation).not.toHaveBeenCalled();
      });

      it('en desarrollo/test acepta FRONTEND_URL con protocolo http:', async () => {
        configGet.mockImplementation((key: string) => {
          if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
          if (key === 'FRONTEND_URL') return 'http://front.local';
          if (key === 'NODE_ENV') return 'development';
          return undefined;
        });

        const response = await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(201);

        expect(response.body.invitationUrl).toMatch(/^http:\/\/front\.local\/registro#token=/);
      });

      it('en desarrollo/test acepta FRONTEND_URL con protocolo https:', async () => {
        configGet.mockImplementation((key: string) => {
          if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
          if (key === 'FRONTEND_URL') return 'https://front.local';
          if (key === 'NODE_ENV') return 'test';
          return undefined;
        });

        const response = await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(201);

        expect(response.body.invitationUrl).toMatch(/^https:\/\/front\.local\/registro#token=/);
      });
    });

    describe('Validación del resultado de entrega (deliver)', () => {
      it('en desarrollo/test acepta canal local con delivered: false e invitationUrl', async () => {
        deliver.mockResolvedValueOnce({
          delivered: false,
          channel: 'local',
          invitationUrl: `http://localhost:3001/registro#token=${SAMPLE_RAW_TOKEN}`,
        });

        const response = await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(201);

        expect(response.body.invitationUrl).toBe(`http://localhost:3001/registro#token=${SAMPLE_RAW_TOKEN}`);
        expect(revokeInvitation).not.toHaveBeenCalled();
      });

      it('acepta canal email cuando delivered: true', async () => {
        deliver.mockResolvedValueOnce({
          delivered: true,
          channel: 'email',
        });

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(201);

        expect(revokeInvitation).not.toHaveBeenCalled();
      });

      it('trata canal email con delivered: false como fallo de entrega, revoca y responde 503', async () => {
        deliver.mockResolvedValueOnce({
          delivered: false,
          channel: 'email',
        });

        const response = await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(response.status).not.toBe(201);
        expect(createInvitation).toHaveBeenCalled();
        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
      });

      it('trata canal local en producción como incompatible, revoca y responde 503', async () => {
        configGet.mockImplementation((key: string) => {
          if (key === 'JWT_SECRET') return SPEC_JWT_SECRET;
          if (key === 'FRONTEND_URL') return 'https://front.empresa.com';
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        });

        deliver.mockResolvedValueOnce({
          delivered: false,
          channel: 'local',
          invitationUrl: `https://front.empresa.com/registro#token=${SAMPLE_RAW_TOKEN}`,
        });

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(createInvitation).toHaveBeenCalled();
        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
      });

      it('rechaza canal local con delivered: true, revoca y responde 503', async () => {
        deliver.mockResolvedValueOnce({
          delivered: true,
          channel: 'local',
          invitationUrl: `http://localhost:3001/registro#token=${SAMPLE_RAW_TOKEN}`,
        });

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
      });

      it('rechaza canal local sin invitationUrl, revoca y responde 503', async () => {
        deliver.mockResolvedValueOnce({
          delivered: false,
          channel: 'local',
          invitationUrl: undefined,
        });

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
      });

      it('rechaza canal desconocido, revoca y responde 503', async () => {
        deliver.mockResolvedValueOnce({
          delivered: true,
          channel: 'sms' as unknown as 'email',
        });

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
      });

      it('si la entrega arroja una excepción, la revoca y responde 503', async () => {
        deliver.mockRejectedValueOnce(new Error('Fallo de red en el transporte'));

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(503);

        expect(createInvitation).toHaveBeenCalled();
        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
      });

      it('si la entrega falla y la revocación de contingencia también falla, no silencia el fallo de revocación', async () => {
        const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        deliver.mockRejectedValueOnce(new Error('Fallo de transporte'));
        revokeInvitation.mockRejectedValueOnce(new Error('Fallo crítico en base de datos al revocar'));

        await http()
          .post('/api/users/invitations')
          .set(admin())
          .send({ email: 'nuevo@empresa.com', role: 'EMPLOYEE', areaIds: [VENTAS] })
          .expect(500);

        expect(createInvitation).toHaveBeenCalled();
        expect(revokeInvitation).toHaveBeenCalledWith(SAMPLE_INVITATION.id);
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining(`Fallo crítico de contingencia: no se pudo revocar la invitación ${SAMPLE_INVITATION.id}`),
          expect.any(String),
        );

        loggerSpy.mockRestore();
      });
    });
  });

  describe('GET /api/users/invitations', () => {
    it('rechaza 401 si no hay token de autenticación', async () => {
      await http().get('/api/users/invitations').expect(401);
    });

    it('rechaza 403 si el rol no es ADMIN', async () => {
      await http()
        .get('/api/users/invitations')
        .set(bearer(SPEC_USERS.supervisorVentas))
        .expect(403);
    });

    it('devuelve 200 con el listado de invitaciones para ADMIN', async () => {
      listInvitations.mockResolvedValueOnce([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'colaborador@empresa.com',
          role: 'EMPLOYEE',
          status: 'PENDING',
          areaIds: [VENTAS],
          areaNames: ['Ventas'],
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          acceptedAt: null,
          revokedAt: null,
          createdBy: { id: 'admin-id', name: 'Ana Administradora' },
        },
      ]);

      const res = await http()
        .get('/api/users/invitations')
        .set(admin())
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].email).toBe('colaborador@empresa.com');
      expect(res.body[0].status).toBe('PENDING');
      expect(listInvitations).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /api/users/invitations/:id', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('rechaza 401 si no hay token', async () => {
      await http().delete(`/api/users/invitations/${validId}`).expect(401);
    });

    it('rechaza 403 si el rol no es ADMIN', async () => {
      await http()
        .delete(`/api/users/invitations/${validId}`)
        .set(bearer(SPEC_USERS.empleadoVentas))
        .expect(403);
    });

    it('rechaza 400 si el ID no es UUID válido', async () => {
      await http()
        .delete('/api/users/invitations/invalido')
        .set(admin())
        .expect(400);
    });

    it('devuelve 404 si la invitación no existe o ya no es revocable', async () => {
      revokeInvitation.mockResolvedValueOnce(false);
      await http()
        .delete(`/api/users/invitations/${validId}`)
        .set(admin())
        .expect(404);
    });

    it('devuelve 200 y { id, revoked: true } si se revoca con éxito', async () => {
      revokeInvitation.mockResolvedValueOnce(true);
      const res = await http()
        .delete(`/api/users/invitations/${validId}`)
        .set(admin())
        .expect(200);

      expect(res.body).toEqual({ id: validId, revoked: true });
      expect(revokeInvitation).toHaveBeenCalledWith(validId);
    });
  });

  describe('Documentación Swagger', () => {
    it('documenta en Swagger los estados esperados para GET y POST', async () => {
      const { body: doc } = await http().get('/api/docs-json').expect(200);
      const paths = (doc as { paths: Record<string, Record<string, { responses: object }>> }).paths;

      expect(Object.keys(paths['/api/users'].get.responses).sort()).toEqual([
        '200', '400', '401', '403', '503',
      ]);

      expect(Object.keys(paths['/api/users/invitations'].post.responses).sort()).toEqual([
        '201', '400', '401', '403', '409', '503',
      ]);
    });
  });
});

describe('LocalInvitationDeliveryService (Aislamiento y entorno)', () => {
  it.each(['development', 'test'])(
    'permite el adaptador local en entorno %s sin arrojar excepción',
    (env) => {
      const config = { get: jest.fn().mockReturnValue(env) } as unknown as ConfigService;
      const service = new LocalInvitationDeliveryService(config);
      expect(() => service.assertReady()).not.toThrow();
    },
  );

  it.each(['production', 'staging', 'qa', 'unknown', undefined])(
    'rechaza assertReady con 503 en entorno %s al no existir proveedor real',
    (env) => {
      const config = { get: jest.fn().mockReturnValue(env) } as unknown as ConfigService;
      const service = new LocalInvitationDeliveryService(config);
      expect(() => service.assertReady()).toThrow(ServiceUnavailableException);
    },
  );

  it('en desarrollo/test deliver devuelve delivered: false con el canal local sin memoria compartida', async () => {
    const config = { get: jest.fn().mockReturnValue('development') } as unknown as ConfigService;
    const service = new LocalInvitationDeliveryService(config);

    const call1 = await service.deliver({
      email: 'a@test.com',
      role: 'EMPLOYEE',
      token: 'tokenA',
      invitationUrl: 'http://localhost:3001/registro#token=tokenA',
    });

    const call2 = await service.deliver({
      email: 'b@test.com',
      role: 'ADMIN',
      token: 'tokenB',
      invitationUrl: 'http://localhost:3001/registro#token=tokenB',
    });

    expect(call1).toEqual({
      delivered: false,
      channel: 'local',
      invitationUrl: 'http://localhost:3001/registro#token=tokenA',
    });
    expect(call2).toEqual({
      delivered: false,
      channel: 'local',
      invitationUrl: 'http://localhost:3001/registro#token=tokenB',
    });
    expect(call1).not.toBe(call2);
  });

  it.each(['production', 'staging', 'qa', undefined])(
    'rechaza deliver con 503 en entorno %s',
    async (env) => {
      const config = { get: jest.fn().mockReturnValue(env) } as unknown as ConfigService;
      const service = new LocalInvitationDeliveryService(config);

      await expect(
        service.deliver({
          email: 'prod@test.com',
          role: 'EMPLOYEE',
          token: 'tokenProd',
          invitationUrl: 'http://localhost:3001/registro#token=tokenProd',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );
});
