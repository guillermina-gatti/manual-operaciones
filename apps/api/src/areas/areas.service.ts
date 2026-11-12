import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AreaResponse } from './dto/area.response';

// Los mismos fallos transitorios de conexión tratados por los adaptadores Prisma de Documentos.
const UNAVAILABLE_CODES = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
]);

function isDatabaseUnavailable(error: unknown): boolean {
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
    error.message === 'Connection terminated unexpectedly'
  );
}

@Injectable()
export class AreasService {
  private readonly logger = new Logger(AreasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AreaResponse[]> {
    try {
      const areas = await this.prisma.area.findMany({
        // Deliberadamente SIN where: el contrato incluye también las áreas inactivas.
        select: { id: true, name: true, isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });

      // DTO público explícito: no devolver columnas internas ni relaciones por accidente.
      return areas.map(({ id, name, isActive }) => ({ id, name, isActive }));
    } catch (error) {
      this.logger.error({
        message: 'Fallo al consultar el catálogo de áreas',
        cause: error instanceof Error ? error.message : String(error),
      });
      if (isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException(
          'No se pudo consultar el catálogo de áreas. Intentá de nuevo más tarde.',
        );
      }
      throw new InternalServerErrorException('No se pudo consultar el catálogo de áreas.');
    }
  }
}
