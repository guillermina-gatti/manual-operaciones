/* Adaptador Prisma para consultas de áreas activas e históricas. */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositoryUnavailableError } from '../documents.repository';
import { AreasDirectory, type DirectoryArea } from '../ports/areas-directory';

const UNAVAILABLE_CODES = new Set([
  'P1000', // Servidor rechazó usuario o contraseña
  'P1001', // No se alcanza el servidor
  'P1002', // Timeout al conectar
  'P1008', // Timeout de la operación
  'P1017', // El servidor cerró la conexión
  'P2024', // Timeout esperando una conexión libre en el pool
  'P2028', // Error de transacción (venció timeout)
]);

const PG_CONNECTION_LOST = 'Connection terminated unexpectedly';

function isUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_CODES.has(error.code)
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    !('code' in error) &&
    error.message === PG_CONNECTION_LOST
  );
}

@Injectable()
export class PrismaAreasDirectory extends AreasDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByIds(ids: string[]): Promise<DirectoryArea[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    try {
      const rows = await this.prisma.area.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, name: true, isActive: true },
      });
      return rows.map(({ id, name, isActive }) => ({ id, name, isActive }));
    } catch (error) {
      if (isUnavailable(error)) {
        throw new RepositoryUnavailableError('La base de datos no responde', {
          cause: error,
        });
      }
      throw error;
    }
  }

  async findExistingIds(ids: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return [];
    }

    try {
      const rows = await this.prisma.area.findMany({
        where: {
          id: { in: uniqueIds },
        },
        select: {
          id: true,
        },
      });

      return rows.map((area) => area.id);
    } catch (error) {
      if (isUnavailable(error)) {
        throw new RepositoryUnavailableError('La base de datos no responde', {
          cause: error,
        });
      }
      throw error;
    }
  }
}
