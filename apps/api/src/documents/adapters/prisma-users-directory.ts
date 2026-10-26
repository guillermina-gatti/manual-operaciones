/* Directorio de usuarios basado en Prisma*/
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositoryUnavailableError } from '../documents.repository';
import { DirectoryUser, UsersDirectory } from '../ports/users-directory';

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
export class PrismaUsersDirectory extends UsersDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<DirectoryUser | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          areas: {
            select: { areaId: true },
          },
        },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        role: user.role,
        areaIds: user.areas.map((relation) => relation.areaId),
      };
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
