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
