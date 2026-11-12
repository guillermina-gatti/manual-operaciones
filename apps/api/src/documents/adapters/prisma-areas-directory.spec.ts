import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositoryUnavailableError } from '../documents.repository';
import { PrismaAreasDirectory } from './prisma-areas-directory';

describe('PrismaAreasDirectory', () => {
  let directory: PrismaAreasDirectory;
  let mockPrisma: {
    area: {
      findMany: jest.Mock;
    };
  };

  const createPrismaRequestError = (code: string, message = 'Prisma request error') =>
    new Prisma.PrismaClientKnownRequestError(message, {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    mockPrisma = {
      area: {
        findMany: jest.fn(),
      },
    };
    directory = new PrismaAreasDirectory(mockPrisma as unknown as PrismaService);
  });

  it('findByIds devuelve nombre y estado, incluso de áreas inactivas', async () => {
    mockPrisma.area.findMany.mockResolvedValue([
      { id: 'area-uuid-1', name: 'Ventas', isActive: true },
      { id: 'area-uuid-2', name: 'Archivo', isActive: false },
    ]);

    const result = await directory.findByIds([
      'area-uuid-1',
      'area-uuid-2',
      'area-uuid-2',
      'no-existe',
    ]);

    expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['area-uuid-1', 'area-uuid-2', 'no-existe'] } },
      select: { id: true, name: true, isActive: true },
    });
    expect(result).toEqual([
      { id: 'area-uuid-1', name: 'Ventas', isActive: true },
      { id: 'area-uuid-2', name: 'Archivo', isActive: false },
    ]);
  });

  it('findByIds no consulta Prisma cuando la lista está vacía', async () => {
    await expect(directory.findByIds([])).resolves.toEqual([]);
    expect(mockPrisma.area.findMany).not.toHaveBeenCalled();
  });

  it('findByIds traduce fallas de conexión sin simular una lista vacía', async () => {
    mockPrisma.area.findMany.mockRejectedValue(createPrismaRequestError('P1001'));
    await expect(directory.findByIds(['area-uuid-1'])).rejects.toThrow(
      RepositoryUnavailableError,
    );
  });

  it('devuelve los IDs existentes de entre los solicitados', async () => {
    mockPrisma.area.findMany.mockResolvedValue([
      { id: 'area-uuid-1' },
      { id: 'area-uuid-2' },
    ]);

    const result = await directory.findExistingIds([
      'area-uuid-1',
      'area-uuid-2',
      'area-uuid-inexistente',
    ]);

    expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['area-uuid-1', 'area-uuid-2', 'area-uuid-inexistente'] },
      },
      select: {
        id: true,
      },
    });
    expect(result).toEqual(['area-uuid-1', 'area-uuid-2']);
  });

  it('devuelve arreglo vacío inmediatamente sin consultar la base si recibe lista vacía', async () => {
    const result = await directory.findExistingIds([]);

    expect(result).toEqual([]);
    expect(mockPrisma.area.findMany).not.toHaveBeenCalled();
  });

  it('deduplica los IDs antes de consultar a Prisma', async () => {
    mockPrisma.area.findMany.mockResolvedValue([{ id: 'area-uuid-1' }]);

    const result = await directory.findExistingIds([
      'area-uuid-1',
      'area-uuid-1',
      'area-uuid-1',
    ]);

    expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['area-uuid-1'] },
      },
      select: {
        id: true,
      },
    });
    expect(result).toEqual(['area-uuid-1']);
  });

  it('devuelve arreglo vacío si ninguna de las áreas existe', async () => {
    mockPrisma.area.findMany.mockResolvedValue([]);

    const result = await directory.findExistingIds(['inexistente-1', 'inexistente-2']);

    expect(result).toEqual([]);
  });

  it('traduce errores conocidos de no disponibilidad de Prisma (ej. P1002 timeout) a RepositoryUnavailableError', async () => {
    mockPrisma.area.findMany.mockRejectedValue(
      createPrismaRequestError('P1002', 'Connection timeout'),
    );

    await expect(
      directory.findExistingIds(['area-uuid-1']),
    ).rejects.toThrow(RepositoryUnavailableError);
    await expect(
      directory.findExistingIds(['area-uuid-1']),
    ).rejects.toThrow('La base de datos no responde');
  });

  it('traduce PrismaClientInitializationError a RepositoryUnavailableError', async () => {
    mockPrisma.area.findMany.mockRejectedValue(
      new Prisma.PrismaClientInitializationError('Init failure', '7.10.0'),
    );

    await expect(
      directory.findExistingIds(['area-uuid-1']),
    ).rejects.toThrow(RepositoryUnavailableError);
  });

  it('traduce corte de conexión de pg (Connection terminated unexpectedly) a RepositoryUnavailableError', async () => {
    mockPrisma.area.findMany.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    await expect(
      directory.findExistingIds(['area-uuid-1']),
    ).rejects.toThrow(RepositoryUnavailableError);
  });

  it('relanza errores inesperados sin modificarlos', async () => {
    const errorInesperado = new Error('Query error');
    mockPrisma.area.findMany.mockRejectedValue(errorInesperado);

    await expect(
      directory.findExistingIds(['area-uuid-1']),
    ).rejects.toThrow(errorInesperado);
  });

  it('se resuelve correctamente a través del inyector de dependencias de NestJS', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaAreasDirectory,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    const resolved = moduleRef.get<PrismaAreasDirectory>(PrismaAreasDirectory);
    expect(resolved).toBeDefined();
    expect(resolved).toBeInstanceOf(PrismaAreasDirectory);
  });
});
