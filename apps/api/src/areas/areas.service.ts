import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AreaResponse } from './dto/area.response';
import type { CreateAreaDto } from './dto/create-area.dto';
import type { UpdateAreaDto } from './dto/update-area.dto';

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

  async create(dto: CreateAreaDto): Promise<AreaResponse> {
    const trimmedName = dto.name.trim();

    const existing = await this.prisma.area.findFirst({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un área con el nombre "${trimmedName}"`);
    }

    try {
      const created = await this.prisma.area.create({
        data: {
          name: trimmedName,
          isActive: true,
        },
        select: { id: true, name: true, isActive: true },
      });

      return created;
    } catch (error) {
      this.logger.error({
        message: 'Fallo al crear el área',
        cause: error instanceof Error ? error.message : String(error),
      });
      if (isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException('No se pudo crear el área. Intentá de nuevo más tarde.');
      }
      throw new InternalServerErrorException('No se pudo crear el área.');
    }
  }

  async update(id: string, dto: UpdateAreaDto): Promise<AreaResponse> {
    const area = await this.prisma.area.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });

    if (!area) {
      throw new NotFoundException('Área no encontrada');
    }

    const trimmedName = dto.name !== undefined ? dto.name.trim() : undefined;

    if (trimmedName !== undefined && trimmedName.toLowerCase() !== area.name.toLowerCase()) {
      const duplicate = await this.prisma.area.findFirst({
        where: {
          name: { equals: trimmedName, mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ConflictException(`Ya existe otra área con el nombre "${trimmedName}"`);
      }
    }

    try {
      const updated = await this.prisma.area.update({
        where: { id },
        data: {
          ...(trimmedName !== undefined ? { name: trimmedName } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: { id: true, name: true, isActive: true },
      });

      return updated;
    } catch (error) {
      this.logger.error({
        message: 'Fallo al actualizar el área',
        cause: error instanceof Error ? error.message : String(error),
      });
      if (isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException('No se pudo actualizar el área. Intentá de nuevo más tarde.');
      }
      throw new InternalServerErrorException('No se pudo actualizar el área.');
    }
  }
}
