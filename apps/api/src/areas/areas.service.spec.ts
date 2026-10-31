import { InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AreasService } from './areas.service';

describe('AreasService (A-11)', () => {
  let service: AreasService;
  let findMany: jest.Mock;

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('Database error', {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    findMany = jest.fn();
    service = new AreasService({ area: { findMany } } as unknown as PrismaService);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lista todas las áreas, incluyendo inactivas, con el orden y la proyección acordados', async () => {
    findMany.mockResolvedValue([
      { id: 'uuid-2', name: 'Operaciones', isActive: false, createdAt: 'interno' },
      { id: 'uuid-1', name: 'Ventas', isActive: true, passwordHash: 'interno' },
    ]);

    await expect(service.list()).resolves.toEqual([
      { id: 'uuid-2', name: 'Operaciones', isActive: false },
      { id: 'uuid-1', name: 'Ventas', isActive: true },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it('devuelve 200 [] si la base no contiene áreas', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });

  it('no elimina las áreas inactivas si todas están deshabilitadas', async () => {
    findMany.mockResolvedValue([{ id: 'uuid-2', name: 'Operaciones', isActive: false }]);
    await expect(service.list()).resolves.toEqual([
      { id: 'uuid-2', name: 'Operaciones', isActive: false },
    ]);
  });

  it.each(['P1001', 'P1002', 'P2024'])(
    'traduce la indisponibilidad de Prisma %s a 503',
    async (code) => {
      findMany.mockRejectedValue(prismaError(code));
      await expect(service.list()).rejects.toThrow(ServiceUnavailableException);
    },
  );

  it('traduce el error de inicialización de Prisma a 503', async () => {
    findMany.mockRejectedValue(
      new Prisma.PrismaClientInitializationError('Sin conexión', '7.10.0'),
    );
    await expect(service.list()).rejects.toThrow(ServiceUnavailableException);
  });

  it('traduce el corte inesperado de PostgreSQL a 503', async () => {
    findMany.mockRejectedValue(new Error('Connection terminated unexpectedly'));
    await expect(service.list()).rejects.toThrow(ServiceUnavailableException);
  });

  it('no confunde un error inesperado con una lista vacía o un problema transitorio', async () => {
    findMany.mockRejectedValue(new Error('Falla de esquema'));
    await expect(service.list()).rejects.toThrow(InternalServerErrorException);
  });
});
