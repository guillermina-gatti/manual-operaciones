import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const UNKNOWN = '0a000000-0000-4000-8000-000000000099';

const RESULTS = [
  { id: 'admin-id', name: 'Ana Administradora', role: 'ADMIN', email: 'privado@example.com' },
  { id: 'employee-id', name: 'Elena Empleada', role: 'EMPLOYEE', isActive: true },
];

describe('UsersService (A-12)', () => {
  let users: UsersService;
  let findAreas: jest.Mock;
  let findUsers: jest.Mock;

  beforeEach(() => {
    findAreas = jest.fn().mockResolvedValue([{ id: VENTAS, isActive: true }, { id: OPERACIONES, isActive: true }]);
    findUsers = jest.fn().mockResolvedValue(RESULTS);
    users = new UsersService({
      area: { findMany: findAreas },
      user: { findMany: findUsers },
    } as unknown as PrismaService);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('valida TODAS las áreas y consulta solo candidatos activos, incluidos ADMIN globales', async () => {
    await expect(users.listOwnerCandidates([VENTAS, OPERACIONES])).resolves.toEqual([
      { id: 'admin-id', name: 'Ana Administradora', role: 'ADMIN' },
      { id: 'employee-id', name: 'Elena Empleada', role: 'EMPLOYEE' },
    ]);
    expect(findAreas).toHaveBeenCalledWith({
      where: { id: { in: [VENTAS, OPERACIONES] } },
      select: { id: true, isActive: true },
    });
    expect(findUsers).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { role: 'ADMIN' },
          { areas: { some: { areaId: { in: [VENTAS, OPERACIONES] }, area: { isActive: true } } } },
        ],
      },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it('deduplica los areaIds antes de validar y buscar personas', async () => {
    findAreas.mockResolvedValue([{ id: VENTAS, isActive: true }]);
    await users.listOwnerCandidates([VENTAS, VENTAS]);
    expect(findAreas).toHaveBeenCalledWith({
      where: { id: { in: [VENTAS] } },
      select: { id: true, isActive: true },
    });
    expect(findUsers.mock.calls[0][0].where.OR[1].areas.some.areaId.in).toEqual([VENTAS]);
  });

  it('rechaza área inexistente aunque otra sea válida y no consulta usuarios', async () => {
    findAreas.mockResolvedValue([{ id: VENTAS, isActive: true }]);
    await expect(users.listOwnerCandidates([VENTAS, UNKNOWN])).rejects.toThrow(BadRequestException);
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('rechaza área inactiva sin exponer la lista de usuarios', async () => {
    findAreas.mockResolvedValue([{ id: VENTAS, isActive: false }]);
    await expect(users.listOwnerCandidates([VENTAS])).rejects.toThrow(BadRequestException);
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('rechaza areaIds vacío sin consultar la base', async () => {
    await expect(users.listOwnerCandidates([])).rejects.toThrow(BadRequestException);
    expect(findAreas).not.toHaveBeenCalled();
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('con candidatos vacíos devuelve [] y no 404', async () => {
    findAreas.mockResolvedValue([{ id: VENTAS, isActive: true }]);
    findUsers.mockResolvedValue([]);
    await expect(users.listOwnerCandidates([VENTAS])).resolves.toEqual([]);
  });

  it.each(['P1001', 'P1002', 'P2024'])('falla de base %s durante áreas devuelve 503', async (code) => {
    findAreas.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Conexión', {
      code, clientVersion: '7.10.0',
    }));
    await expect(users.listOwnerCandidates([VENTAS])).rejects.toThrow(ServiceUnavailableException);
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('falla de base durante usuarios devuelve 503 y no []', async () => {
    findAreas.mockResolvedValue([{ id: VENTAS, isActive: true }]);
    findUsers.mockRejectedValue(new Prisma.PrismaClientInitializationError('No responde', '7.10.0'));
    await expect(users.listOwnerCandidates([VENTAS])).rejects.toThrow(ServiceUnavailableException);
  });

  it('error desconocido devuelve 500 sin exponer información interna', async () => {
    findAreas.mockRejectedValue(new Error('Columna interna rota'));
    await expect(users.listOwnerCandidates([VENTAS])).rejects.toThrow(InternalServerErrorException);
  });
});

describe('UsersService - listAllUsersForAdmin y updateUserByAdmin', () => {
  let users: UsersService;
  let mockPrisma: any;

  const adminId = '0b000000-0000-4000-8000-000000000001';
  const targetUserId = '0b000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      area: {
        findMany: jest.fn(),
      },
      userArea: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      session: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    users = new UsersService(mockPrisma as unknown as PrismaService);
  });

  describe('listAllUsersForAdmin', () => {
    it('devuelve todos los usuarios con sus áreas mapeadas', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: adminId,
          name: 'Admin',
          email: 'admin@empresa.com',
          role: 'ADMIN',
          isActive: true,
          createdAt: new Date(),
          areas: [],
        },
        {
          id: targetUserId,
          name: 'Empleado',
          email: 'empleado@empresa.com',
          role: 'EMPLOYEE',
          isActive: true,
          createdAt: new Date(),
          areas: [{ area: { id: VENTAS, name: 'Ventas' } }],
        },
      ]);

      const result = await users.listAllUsersForAdmin();
      expect(result).toHaveLength(2);
      expect(result[0].areas).toEqual([]);
      expect(result[1].areas).toEqual([{ id: VENTAS, name: 'Ventas' }]);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        include: {
          areas: {
            include: {
              area: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });
    });
  });

  describe('updateUserByAdmin', () => {
    const existingEmployee = {
      id: targetUserId,
      name: 'Empleado',
      email: 'empleado@empresa.com',
      role: 'EMPLOYEE',
      isActive: true,
      createdAt: new Date(),
      areas: [{ area: { id: VENTAS, name: 'Ventas' } }],
    };

    it('impide la autodesactivación de la cuenta del administrador que ejecuta la acción', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: adminId,
        role: 'ADMIN',
        isActive: true,
        areas: [],
      });
      await expect(
        users.updateUserByAdmin(adminId, adminId, { isActive: false }),
      ).rejects.toThrow('No podés desactivar tu propia cuenta de administrador');
    });

    it('impide la auto-remoción del rol de administrador de la cuenta propia', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: adminId,
        role: 'ADMIN',
        isActive: true,
        areas: [],
      });
      await expect(
        users.updateUserByAdmin(adminId, adminId, { role: 'EMPLOYEE', areaIds: [VENTAS] }),
      ).rejects.toThrow('No podés quitarte tu propio rol de administrador');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        users.updateUserByAdmin(adminId, targetUserId, { role: 'SUPERVISOR' }),
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('rechaza asignar áreas a un usuario con rol ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingEmployee);
      await expect(
        users.updateUserByAdmin(adminId, targetUserId, { role: 'ADMIN', areaIds: [VENTAS] }),
      ).rejects.toThrow('Los administradores no deben tener áreas asignadas');
    });

    it('rechaza dejar a un supervisor/empleado con 0 áreas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingEmployee);
      await expect(
        users.updateUserByAdmin(adminId, targetUserId, { role: 'SUPERVISOR', areaIds: [] }),
      ).rejects.toThrow('Los empleados y supervisores deben tener al menos un área asignada');
    });

    it('rechaza áreas inactivas o inexistentes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingEmployee);
      mockPrisma.area.findMany.mockResolvedValue([{ id: VENTAS, isActive: false }]);
      await expect(
        users.updateUserByAdmin(adminId, targetUserId, { areaIds: [VENTAS] }),
      ).rejects.toThrow('Una o más áreas son inexistentes o están inactivas');
    });

    it('rechaza desactivar o degradar al único administrador activo del sistema', async () => {
      const existingAdmin = {
        id: targetUserId,
        name: 'Segundo Admin',
        email: 'admin2@empresa.com',
        role: 'ADMIN',
        isActive: true,
        createdAt: new Date(),
        areas: [],
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingAdmin);
      mockPrisma.user.count.mockResolvedValue(0); // 0 other active admins

      await expect(
        users.updateUserByAdmin(adminId, targetUserId, { isActive: false }),
      ).rejects.toThrow('No se puede desactivar ni modificar el rol del único administrador activo del sistema');
    });

    it('actualiza rol, áreas y estado correctamente dentro de una transacción e invalida sesiones al desactivar', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingEmployee);
      mockPrisma.area.findMany.mockResolvedValue([{ id: OPERACIONES, isActive: true }]);
      mockPrisma.user.update.mockResolvedValue({
        ...existingEmployee,
        role: 'SUPERVISOR',
        isActive: false,
        areas: [{ area: { id: OPERACIONES, name: 'Operaciones' } }],
      });

      const res = await users.updateUserByAdmin(adminId, targetUserId, {
        role: 'SUPERVISOR',
        areaIds: [OPERACIONES],
        isActive: false,
      });

      expect(res.role).toBe('SUPERVISOR');
      expect(res.isActive).toBe(false);
      expect(res.areas).toEqual([{ id: OPERACIONES, name: 'Operaciones' }]);
      expect(mockPrisma.userArea.deleteMany).toHaveBeenCalledWith({ where: { userId: targetUserId } });
      expect(mockPrisma.userArea.createMany).toHaveBeenCalledWith({
        data: [{ userId: targetUserId, areaId: OPERACIONES }],
      });
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: targetUserId } });
    });
  });
});
