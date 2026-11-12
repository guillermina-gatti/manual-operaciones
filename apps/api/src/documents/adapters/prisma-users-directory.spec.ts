import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositoryUnavailableError } from '../documents.repository';
import { PrismaUsersDirectory } from './prisma-users-directory';

describe('PrismaUsersDirectory', () => {
  let directory: PrismaUsersDirectory;
  let mockPrisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const createPrismaRequestError = (
    code: string,
    message = 'Prisma request error',
  ) =>
    new Prisma.PrismaClientKnownRequestError(message, {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    directory = new PrismaUsersDirectory(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('devuelve el usuario mapeado con sus áreas cuando existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-uuid-1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'EMPLOYEE',
      isActive: true,
      areas: [{ areaId: 'area-uuid-1' }, { areaId: 'area-uuid-2' }],
    });

    const result = await directory.findById('user-uuid-1');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-uuid-1' },
      include: {
        areas: {
          select: { areaId: true },
        },
      },
    });
    expect(result).toEqual({
      id: 'user-uuid-1',
      name: 'Test User',
      role: 'EMPLOYEE',
      isActive: true,
      areaIds: ['area-uuid-1', 'area-uuid-2'],
    });
  });

  it('devuelve el usuario con areaIds vacío si no tiene áreas asignadas', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'admin-uuid-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'ADMIN',
      isActive: true,
      areas: [],
    });

    const result = await directory.findById('admin-uuid-1');

    expect(result).toEqual({
      id: 'admin-uuid-1',
      name: 'Admin User',
      role: 'ADMIN',
      isActive: true,
      areaIds: [],
    });
  });

  it('conserva el estado inactivo de un usuario histórico en lugar de devolver null', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-inactivo',
      name: 'Usuario histórico',
      role: 'EMPLOYEE',
      isActive: false,
      areas: [{ areaId: 'area-uuid-1' }],
    });

    await expect(directory.findById('user-inactivo')).resolves.toEqual({
      id: 'user-inactivo',
      name: 'Usuario histórico',
      role: 'EMPLOYEE',
      isActive: false,
      areaIds: ['area-uuid-1'],
    });
  });

  it('devuelve null si el usuario no existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await directory.findById('unknown-uuid');

    expect(result).toBeNull();
  });

  it('traduce errores conocidos de no disponibilidad de Prisma (ej. P1001) a RepositoryUnavailableError', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(
      createPrismaRequestError('P1001', "Can't reach database server"),
    );

    await expect(directory.findById('user-uuid-1')).rejects.toThrow(
      RepositoryUnavailableError,
    );
    await expect(directory.findById('user-uuid-1')).rejects.toThrow(
      'La base de datos no responde',
    );
  });

  it('traduce PrismaClientInitializationError a RepositoryUnavailableError', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(
      new Prisma.PrismaClientInitializationError('DB init error', '7.10.0'),
    );

    await expect(directory.findById('user-uuid-1')).rejects.toThrow(
      RepositoryUnavailableError,
    );
  });

  it('traduce corte de conexión de pg (Connection terminated unexpectedly) a RepositoryUnavailableError', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    await expect(directory.findById('user-uuid-1')).rejects.toThrow(
      RepositoryUnavailableError,
    );
  });

  it('relanza errores inesperados sin modificarlos', async () => {
    const errorInesperado = new Error('Error inesperado de base de datos');
    mockPrisma.user.findUnique.mockRejectedValue(errorInesperado);

    await expect(directory.findById('user-uuid-1')).rejects.toThrow(
      errorInesperado,
    );
  });

  it('se resuelve correctamente a través del inyector de dependencias de NestJS', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaUsersDirectory,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    const resolved = moduleRef.get<PrismaUsersDirectory>(PrismaUsersDirectory);

    expect(resolved).toBeDefined();
    expect(resolved).toBeInstanceOf(PrismaUsersDirectory);
  });

  it('findByIds consulta una sola vez, elimina duplicados y conserva usuarios inactivos', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'inactivo',
        name: 'Usuario histórico',
        role: 'SUPERVISOR',
        isActive: false,
        areas: [{ areaId: 'area-2' }],
      },
      {
        id: 'activo',
        name: 'Usuario actual',
        role: 'EMPLOYEE',
        isActive: true,
        areas: [{ areaId: 'area-1' }],
      },
    ]);

    const result = await directory.findByIds([
      'activo',
      'inactivo',
      'activo',
      'inexistente',
    ]);

    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['activo', 'inactivo', 'inexistente'],
        },
      },
      include: {
        areas: {
          select: { areaId: true },
        },
      },
    });

    expect(result).toEqual([
      {
        id: 'activo',
        name: 'Usuario actual',
        role: 'EMPLOYEE',
        isActive: true,
        areaIds: ['area-1'],
      },
      {
        id: 'inactivo',
        name: 'Usuario histórico',
        role: 'SUPERVISOR',
        isActive: false,
        areaIds: ['area-2'],
      },
    ]);
  });

  it('findByIds no consulta Prisma cuando la lista está vacía', async () => {
    await expect(directory.findByIds([])).resolves.toEqual([]);

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('findByIds propaga errores de conexión como RepositoryUnavailableError', async () => {
    mockPrisma.user.findMany.mockRejectedValue(
      createPrismaRequestError('P1001'),
    );

    await expect(directory.findByIds(['activo'])).rejects.toThrow(
      RepositoryUnavailableError,
    );
  });
});
