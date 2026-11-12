import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import type { AuthUser } from './auth.types';

const USER_ID = '0b000000-0000-4000-8000-000000000003';
const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const AREA_VENTAS = '0a000000-0000-4000-8000-000000000001';
const AREA_OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const AREA_INEXISTENTE = '0a000000-0000-4000-8000-000000000099';

const employeeUser: AuthUser = {
  id: USER_ID,
  email: 'empleado@empresa.com',
  name: 'Empleado Ventas',
  role: 'EMPLOYEE',
  areaIds: [AREA_VENTAS],
};

const adminUser: AuthUser = {
  id: ADMIN_ID,
  email: 'admin@empresa.com',
  name: 'Admin',
  role: 'ADMIN',
  areaIds: [],
};

describe('AccessService', () => {
  let service: AccessService;
  let mockPrisma: {
    area: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    mockPrisma = {
      area: {
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    service = new AccessService(mockPrisma as unknown as PrismaService);
  });

  it('concede acceso cuando las áreas existen y están activas y el usuario comparte al menos una en PostgreSQL', async () => {
    mockPrisma.area.findMany.mockResolvedValue([
      { id: AREA_VENTAS },
      { id: AREA_OPERACIONES },
    ]);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      role: 'EMPLOYEE',
      isActive: true,
      areas: [{ areaId: AREA_VENTAS }],
    });

    await expect(
      service.assertAreaAccess(employeeUser, [AREA_VENTAS, AREA_OPERACIONES]),
    ).resolves.toBeUndefined();

    expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [AREA_VENTAS, AREA_OPERACIONES] },
        isActive: true,
      },
      select: { id: true },
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: {
        id: true,
        role: true,
        isActive: true,
        areas: {
          where: { area: { isActive: true } },
          select: { areaId: true },
        },
      },
    });
  });

  it('concede acceso a todas las áreas existentes y activas si el usuario vigente en PostgreSQL es ADMIN, sin requerir asignación explícita', async () => {
    mockPrisma.area.findMany.mockResolvedValue([
      { id: AREA_VENTAS },
      { id: AREA_OPERACIONES },
    ]);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: ADMIN_ID,
      role: 'ADMIN',
      isActive: true,
      areas: [],
    });

    await expect(
      service.assertAreaAccess(adminUser, [AREA_VENTAS, AREA_OPERACIONES]),
    ).resolves.toBeUndefined();
  });

  it('lanza 404 NotFoundException cuando el usuario no tiene asignada ninguna de las áreas del recurso en PostgreSQL', async () => {
    mockPrisma.area.findMany.mockResolvedValue([{ id: AREA_OPERACIONES }]);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      role: 'EMPLOYEE',
      isActive: true,
      areas: [{ areaId: AREA_VENTAS }],
    });

    await expect(
      service.assertAreaAccess(employeeUser, [AREA_OPERACIONES]),
    ).rejects.toThrow(NotFoundException);
  });

  it('consulta las asignaciones vigentes en PostgreSQL e ignora areaIds obsoletos en el objeto user de entrada', async () => {
    // El objeto en memoria decía que tenía AREA_VENTAS, pero en PostgreSQL le fue retirada
    mockPrisma.area.findMany.mockResolvedValue([{ id: AREA_VENTAS }]);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      role: 'EMPLOYEE',
      isActive: true,
      areas: [],
    });

    await expect(
      service.assertAreaAccess(employeeUser, [AREA_VENTAS]),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza 404 NotFoundException si alguna de las áreas solicitadas no existe o está inactiva, incluso para ADMIN', async () => {
    // Se pidieron 2 áreas, pero solo 1 existe y está activa en PostgreSQL
    mockPrisma.area.findMany.mockResolvedValue([{ id: AREA_VENTAS }]);

    await expect(
      service.assertAreaAccess(adminUser, [AREA_VENTAS, AREA_INEXISTENTE]),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lanza 400 BadRequestException si la lista de áreas está vacía', async () => {
    await expect(service.assertAreaAccess(employeeUser, [])).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrisma.area.findMany).not.toHaveBeenCalled();
  });

  it('lanza 400 BadRequestException si algún identificador de área o de usuario no es un UUID válido', async () => {
    await expect(
      service.assertAreaAccess(employeeUser, [AREA_VENTAS, 'no-es-uuid']),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.assertAreaAccess({ id: 'id-invalido' }, [AREA_VENTAS]),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.area.findMany).not.toHaveBeenCalled();
  });
});
