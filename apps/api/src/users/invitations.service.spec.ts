import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  hashInvitationToken,
  INVITATION_TOKEN_BASE64URL_REGEX,
} from '../auth/token.utils';
import {
  InvitationsService,
  INVITATION_TTL_MS,
} from './invitations.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const INACTIVE_AREA = '0a000000-0000-4000-8000-000000000003';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

describe('InvitationsService (HU29)', () => {
  let service: InvitationsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      area: {
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      userInvitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    service = new InvitationsService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createInvitation()', () => {
    it('crea una invitación válida para EMPLOYEE con áreas, normalizando el correo', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      const fakeCreated = {
        id: 'invitation-uuid-1',
        email: 'nuevo.empleado@empresa.com',
        role: 'EMPLOYEE',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        createdAt: new Date(),
        createdById: ADMIN_ID,
        areas: [{ areaId: VENTAS }],
      };
      mockPrisma.userInvitation.create.mockResolvedValue(fakeCreated);

      const result = await service.createInvitation({
        email: '  Nuevo.Empleado@Empresa.COM  ',
        role: 'EMPLOYEE',
        areaIds: [VENTAS],
        createdById: ADMIN_ID,
      });

      expect(result.invitation.email).toBe('nuevo.empleado@empresa.com');
      expect(result.invitation.role).toBe('EMPLOYEE');
      expect(result.invitation.areaIds).toEqual([VENTAS]);
      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken).toHaveLength(43);
      expect(INVITATION_TOKEN_BASE64URL_REGEX.test(result.rawToken)).toBe(true);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: { equals: 'nuevo.empleado@empresa.com', mode: 'insensitive' },
        },
        select: { id: true },
      });

      expect(mockPrisma.userInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'nuevo.empleado@empresa.com',
            role: 'EMPLOYEE',
            createdById: ADMIN_ID,
            tokenHash: hashInvitationToken(result.rawToken),
          }),
        }),
      );
    });

    it('permite crear una invitación para ADMIN sin áreas', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      const fakeCreated = {
        id: 'invitation-uuid-admin',
        email: 'nuevo.admin@empresa.com',
        role: 'ADMIN',
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        createdAt: new Date(),
        createdById: ADMIN_ID,
        areas: [],
      };
      mockPrisma.userInvitation.create.mockResolvedValue(fakeCreated);

      const result = await service.createInvitation({
        email: 'nuevo.admin@empresa.com',
        role: 'ADMIN',
        areaIds: [],
        createdById: ADMIN_ID,
      });

      expect(result.invitation.role).toBe('ADMIN');
      expect(result.invitation.areaIds).toEqual([]);
      expect(mockPrisma.area.findMany).not.toHaveBeenCalled();
    });

    it('deduplica los identificadores de áreas antes de validar y persistir', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      const fakeCreated = {
        id: 'invitation-uuid-dedup',
        email: 'dedup@empresa.com',
        role: 'EMPLOYEE',
        tokenHash: 'c'.repeat(64),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        createdAt: new Date(),
        createdById: ADMIN_ID,
        areas: [{ areaId: VENTAS }],
      };
      mockPrisma.userInvitation.create.mockResolvedValue(fakeCreated);

      await service.createInvitation({
        email: 'dedup@empresa.com',
        role: 'EMPLOYEE',
        areaIds: [VENTAS, VENTAS, VENTAS],
        createdById: ADMIN_ID,
      });

      expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
        where: { id: { in: [VENTAS] } },
        select: { id: true, isActive: true },
      });

      expect(mockPrisma.userInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            areas: { create: [{ areaId: VENTAS }] },
          }),
        }),
      );
    });

    it('rechaza si EMPLOYEE no tiene áreas asignadas', async () => {
      await expect(
        service.createInvitation({
          email: 'sin.areas@empresa.com',
          role: 'EMPLOYEE',
          areaIds: [],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('rechaza si alguna de las áreas indicadas es inexistente o inactiva', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
        { id: INACTIVE_AREA, isActive: false },
      ]);

      await expect(
        service.createInvitation({
          email: 'area.inactiva@empresa.com',
          role: 'SUPERVISOR',
          areaIds: [VENTAS, INACTIVE_AREA],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('rechaza con 409 Conflict si el correo ya pertenece a un usuario registrado', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-id-existente' });

      await expect(
        service.createInvitation({
          email: 'ya.registrado@empresa.com',
          role: 'EMPLOYEE',
          areaIds: [VENTAS],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.userInvitation.create).not.toHaveBeenCalled();
    });

    it('rechaza con 409 Conflict si ya existe una invitación pendiente y todavía vigente', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      mockPrisma.userInvitation.findFirst.mockResolvedValue({
        id: 'invitation-vigente',
        email: 'pendiente@empresa.com',
        expiresAt: new Date(Date.now() + 3600 * 1000), // Vence en 1 hora
        acceptedAt: null,
        revokedAt: null,
      });

      await expect(
        service.createInvitation({
          email: 'pendiente@empresa.com',
          role: 'EMPLOYEE',
          areaIds: [VENTAS],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.userInvitation.update).not.toHaveBeenCalled();
      expect(mockPrisma.userInvitation.create).not.toHaveBeenCalled();
    });

    it('reemite revocando condicionalmente la invitación previa si estaba vencida (count === 1)', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const expiredDate = new Date(Date.now() - 3600 * 1000); // Venció hace 1 hora
      mockPrisma.userInvitation.findFirst.mockResolvedValue({
        id: 'invitation-vencida',
        email: 'vencida@empresa.com',
        expiresAt: expiredDate,
        acceptedAt: null,
        revokedAt: null,
      });

      mockPrisma.userInvitation.updateMany.mockResolvedValue({ count: 1 });

      const fakeCreated = {
        id: 'invitation-uuid-nueva',
        email: 'vencida@empresa.com',
        role: 'EMPLOYEE',
        tokenHash: 'd'.repeat(64),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        createdAt: new Date(),
        createdById: ADMIN_ID,
        areas: [{ areaId: VENTAS }],
      };
      mockPrisma.userInvitation.create.mockResolvedValue(fakeCreated);

      const result = await service.createInvitation({
        email: 'vencida@empresa.com',
        role: 'EMPLOYEE',
        areaIds: [VENTAS],
        createdById: ADMIN_ID,
      });

      expect(mockPrisma.userInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invitation-vencida',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { lte: expect.any(Date) },
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      expect(mockPrisma.userInvitation.create).toHaveBeenCalled();
      expect(result.invitation.id).toBe('invitation-uuid-nueva');
    });

    it('aborta la reemisión con ConflictException si updateMany devuelve count === 0 y NO crea la invitación', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const expiredDate = new Date(Date.now() - 3600 * 1000);
      mockPrisma.userInvitation.findFirst.mockResolvedValue({
        id: 'invitation-vencida-concurrente',
        email: 'vencida@empresa.com',
        expiresAt: expiredDate,
        acceptedAt: null,
        revokedAt: null,
      });

      // Simula que otra solicitud en paralelo modificó la invitación (la aceptó o revocó) antes del updateMany
      mockPrisma.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createInvitation({
          email: 'vencida@empresa.com',
          role: 'EMPLOYEE',
          areaIds: [VENTAS],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.userInvitation.create).not.toHaveBeenCalled();
    });

    it('captura P2002 sobre email y lo traduce a ConflictException', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['email'] },
        },
      );
      mockPrisma.userInvitation.create.mockRejectedValue(p2002Error);

      await expect(
        service.createInvitation({
          email: 'concurrente@empresa.com',
          role: 'EMPLOYEE',
          areaIds: [VENTAS],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('no traduce errores P2002 ajenos a email a ConflictException', async () => {
      mockPrisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      const otherP2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation on other field',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['other_field'] },
        },
      );
      mockPrisma.userInvitation.create.mockRejectedValue(otherP2002);

      await expect(
        service.createInvitation({
          email: 'otro@empresa.com',
          role: 'EMPLOYEE',
          areaIds: [VENTAS],
          createdById: ADMIN_ID,
        }),
      ).rejects.toThrow(otherP2002);
    });
  });

  describe('validateToken()', () => {
    it('valida exitosamente un token activo y devuelve los datos asociados', async () => {
      const rawToken = 'A'.repeat(43);
      const tokenHash = hashInvitationToken(rawToken);

      mockPrisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id',
        email: 'valido@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        acceptedAt: null,
        revokedAt: null,
        areas: [{ areaId: VENTAS }],
      });

      const result = await service.validateToken(rawToken);

      expect(mockPrisma.userInvitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash },
        include: { areas: true },
      });
      expect(result).toEqual({
        id: 'invitation-id',
        email: 'valido@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: expect.any(Date),
        areaIds: [VENTAS],
      });
    });

    it('rechaza formato de token inválido con BadRequestException', async () => {
      await expect(service.validateToken('corto')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validateToken('A'.repeat(42) + '=')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.userInvitation.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza con NotFoundException si el token no existe', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.validateToken('A'.repeat(43))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza con GoneException si la invitación ya fue aceptada', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id',
        email: 'consumida@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        acceptedAt: new Date(),
        revokedAt: null,
        areas: [],
      });

      await expect(service.validateToken('A'.repeat(43))).rejects.toThrow(
        GoneException,
      );
    });

    it('rechaza con GoneException si la invitación fue revocada', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id',
        email: 'revocada@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        acceptedAt: null,
        revokedAt: new Date(),
        areas: [],
      });

      await expect(service.validateToken('A'.repeat(43))).rejects.toThrow(
        GoneException,
      );
    });

    it('rechaza con GoneException si la invitación ha expirado', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id',
        email: 'expirada@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() - 1000),
        acceptedAt: null,
        revokedAt: null,
        areas: [],
      });

      await expect(service.validateToken('A'.repeat(43))).rejects.toThrow(
        GoneException,
      );
    });
  });

  describe('consumeInvitation()', () => {
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        userInvitation: {
          findUnique: jest.fn(),
          updateMany: jest.fn(),
        },
      };
    });

    it('consume atómicamente la invitación dentro de la transacción de registro', async () => {
      const rawToken = 'B'.repeat(43);
      const tokenHash = hashInvitationToken(rawToken);

      mockTx.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id-consume',
        email: 'consumir@empresa.com',
        role: 'SUPERVISOR',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        acceptedAt: null,
        revokedAt: null,
        areas: [{ areaId: OPERACIONES }],
      });

      mockTx.userInvitation.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.consumeInvitation(
        rawToken,
        mockTx as unknown as Prisma.TransactionClient,
      );

      expect(mockTx.userInvitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash },
        include: { areas: true },
      });

      expect(mockTx.userInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invitation-id-consume',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: {
          acceptedAt: expect.any(Date),
        },
      });

      expect(result).toEqual({
        id: 'invitation-id-consume',
        email: 'consumir@empresa.com',
        role: 'SUPERVISOR',
        expiresAt: expect.any(Date),
        areaIds: [OPERACIONES],
      });
    });

    it('detecta colisión concurrente si updateMany devuelve count === 0 y lanza ConflictException', async () => {
      const rawToken = 'C'.repeat(43);

      mockTx.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id-race',
        email: 'carrera@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        acceptedAt: null,
        revokedAt: null,
        areas: [],
      });

      // Simula que otra solicitud en paralelo consumió la invitación milisegundos antes
      mockTx.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.consumeInvitation(
          rawToken,
          mockTx as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza si la invitación ya estaba aceptada al momento de consultar', async () => {
      const rawToken = 'D'.repeat(43);

      mockTx.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id-already-accepted',
        email: 'ya-aceptada@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        acceptedAt: new Date(),
        revokedAt: null,
        areas: [],
      });

      await expect(
        service.consumeInvitation(
          rawToken,
          mockTx as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(GoneException);

      expect(mockTx.userInvitation.updateMany).not.toHaveBeenCalled();
    });

    it('rechaza si la invitación está expirada', async () => {
      const rawToken = 'E'.repeat(43);

      mockTx.userInvitation.findUnique.mockResolvedValue({
        id: 'invitation-id-expired',
        email: 'expirada@empresa.com',
        role: 'EMPLOYEE',
        expiresAt: new Date(Date.now() - 5000),
        acceptedAt: null,
        revokedAt: null,
        areas: [],
      });

      await expect(
        service.consumeInvitation(
          rawToken,
          mockTx as unknown as Prisma.TransactionClient,
        ),
      ).rejects.toThrow(GoneException);

      expect(mockTx.userInvitation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listInvitations()', () => {
    it('retorna las invitaciones con el estado calculado correctamente', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 1000000);
      const past = new Date(now.getTime() - 1000000);

      mockPrisma.userInvitation.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          email: 'pending@empresa.com',
          role: 'EMPLOYEE',
          expiresAt: future,
          acceptedAt: null,
          revokedAt: null,
          createdAt: now,
          areas: [{ areaId: 'area-1', area: { name: 'Ventas' } }],
          createdBy: { id: 'admin-1', name: 'Ana' },
        },
        {
          id: 'inv-2',
          email: 'accepted@empresa.com',
          role: 'SUPERVISOR',
          expiresAt: future,
          acceptedAt: now,
          revokedAt: null,
          createdAt: now,
          areas: [{ areaId: 'area-1', area: { name: 'Ventas' } }],
          createdBy: { id: 'admin-1', name: 'Ana' },
        },
        {
          id: 'inv-3',
          email: 'revoked@empresa.com',
          role: 'EMPLOYEE',
          expiresAt: future,
          acceptedAt: null,
          revokedAt: now,
          createdAt: now,
          areas: [],
          createdBy: { id: 'admin-1', name: 'Ana' },
        },
        {
          id: 'inv-4',
          email: 'expired@empresa.com',
          role: 'EMPLOYEE',
          expiresAt: past,
          acceptedAt: null,
          revokedAt: null,
          createdAt: past,
          areas: [],
          createdBy: { id: 'admin-1', name: 'Ana' },
        },
      ]);

      const result = await service.listInvitations();

      expect(result).toHaveLength(4);
      expect(result[0].status).toBe('PENDING');
      expect(result[0].areaNames).toEqual(['Ventas']);
      expect(result[1].status).toBe('ACCEPTED');
      expect(result[2].status).toBe('REVOKED');
      expect(result[3].status).toBe('EXPIRED');
    });
  });

  describe('revokeInvitation()', () => {
    it('revoca la invitación activa y devuelve true si existía', async () => {
      mockPrisma.userInvitation.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.revokeInvitation('invitation-to-revoke');

      expect(mockPrisma.userInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invitation-to-revoke',
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
      expect(result).toBe(true);
    });

    it('devuelve false si la invitación no existía o ya estaba aceptada/revocada', async () => {
      mockPrisma.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.revokeInvitation('invitation-none');

      expect(result).toBe(false);
    });
  });
});
