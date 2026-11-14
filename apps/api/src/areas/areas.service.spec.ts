import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

  describe('create (ABM Áreas)', () => {
    let findFirst: jest.Mock;
    let createMock: jest.Mock;

    beforeEach(() => {
      findFirst = jest.fn();
      createMock = jest.fn();
      service = new AreasService({
        area: { findMany, findFirst, create: createMock },
      } as unknown as PrismaService);
    });

    it('crea un área con isActive: true si el nombre no existe', async () => {
      findFirst.mockResolvedValue(null);
      createMock.mockResolvedValue({
        id: 'new-uuid',
        name: 'Recursos Humanos',
        isActive: true,
      });

      const res = await service.create({ name: '  Recursos Humanos  ' });
      expect(res).toEqual({ id: 'new-uuid', name: 'Recursos Humanos', isActive: true });
      expect(findFirst).toHaveBeenCalledWith({
        where: { name: { equals: 'Recursos Humanos', mode: 'insensitive' } },
      });
      expect(createMock).toHaveBeenCalledWith({
        data: { name: 'Recursos Humanos', isActive: true },
        select: { id: true, name: true, isActive: true },
      });
    });

    it('rechaza con ConflictException si ya existe un área con ese nombre', async () => {
      findFirst.mockResolvedValue({ id: 'existing-uuid', name: 'Ventas' });
      await expect(service.create({ name: 'ventas' })).rejects.toThrow(ConflictException);
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('update (ABM Áreas)', () => {
    let findUnique: jest.Mock;
    let findFirst: jest.Mock;
    let updateMock: jest.Mock;

    beforeEach(() => {
      findUnique = jest.fn();
      findFirst = jest.fn();
      updateMock = jest.fn();
      service = new AreasService({
        area: { findMany, findUnique, findFirst, update: updateMock },
      } as unknown as PrismaService);
    });

    it('lanza NotFoundException si el área no existe', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.update('no-uuid', { name: 'Finanzas' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza con ConflictException si el nuevo nombre ya pertenece a otra área', async () => {
      findUnique.mockResolvedValue({ id: 'area-1', name: 'Ventas', isActive: true });
      findFirst.mockResolvedValue({ id: 'area-2', name: 'Operaciones', isActive: true });

      await expect(service.update('area-1', { name: 'operaciones' })).rejects.toThrow(
        ConflictException,
      );
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('permite renombrar y desactivar el área correctamente', async () => {
      findUnique.mockResolvedValue({ id: 'area-1', name: 'Ventas', isActive: true });
      findFirst.mockResolvedValue(null);
      updateMock.mockResolvedValue({ id: 'area-1', name: 'Comercial', isActive: false });

      const res = await service.update('area-1', { name: 'Comercial', isActive: false });
      expect(res).toEqual({ id: 'area-1', name: 'Comercial', isActive: false });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        data: { name: 'Comercial', isActive: false },
        select: { id: true, name: true, isActive: true },
      });
    });
  });
});
