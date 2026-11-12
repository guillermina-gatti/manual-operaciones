import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import { UUID_REGEX } from './session.service';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica que las áreas requeridas existan y estén activas en PostgreSQL y que el
   * usuario tenga acceso a ellas según el estado vigente en la base de datos:
   * - Lista `areaIds` vacía o con elementos que no sean UUID válidos -> 400 BadRequestException.
   * - Alguna de las áreas solicitadas no existe o está inactiva en PostgreSQL -> 404 NotFoundException
   *   (incluso para ADMIN).
   * - Usuario con rol vigente `ADMIN` en PostgreSQL -> acceso permitido a cualquier área existente y activa.
   * - Otros roles (`SUPERVISOR`, `EMPLOYEE`) -> acceso permitido si tiene asignada al menos una
   *   de las áreas activas del recurso (`some`); de lo contrario -> 404 NotFoundException.
   */
  async assertAreaAccess(
    user: Pick<AuthUser, 'id'> | AuthUser,
    areaIds: string[],
  ): Promise<void> {
    if (
      !user ||
      typeof user.id !== 'string' ||
      !UUID_REGEX.test(user.id.trim())
    ) {
      throw new BadRequestException('Identificador de usuario inválido');
    }

    if (!Array.isArray(areaIds) || areaIds.length === 0) {
      throw new BadRequestException(
        'Se requiere al menos un identificador de área',
      );
    }

    const uniqueAreaIds: string[] = [];
    const seen = new Set<string>();

    for (const rawId of areaIds) {
      if (typeof rawId !== 'string' || !UUID_REGEX.test(rawId.trim())) {
        throw new BadRequestException('Identificador de área inválido');
      }
      const trimmed = rawId.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        uniqueAreaIds.push(trimmed);
      }
    }

    const existingActiveAreas = await this.prisma.area.findMany({
      where: {
        id: { in: uniqueAreaIds },
        isActive: true,
      },
      select: { id: true },
    });

    if (existingActiveAreas.length !== uniqueAreaIds.length) {
      throw new NotFoundException(
        'El recurso no existe o no es visible para el usuario',
      );
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id.trim() },
      select: {
        id: true,
        role: true,
        isActive: true,
        areas: {
          where: {
            area: { isActive: true },
          },
          select: { areaId: true },
        },
      },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new NotFoundException(
        'El recurso no existe o no es visible para el usuario',
      );
    }

    if (dbUser.role === 'ADMIN') {
      return;
    }

    const assignedAreaIds = new Set(
      dbUser.areas.map((relation) => relation.areaId),
    );
    const hasAccess = uniqueAreaIds.some((areaId) =>
      assignedAreaIds.has(areaId),
    );

    if (!hasAccess) {
      throw new NotFoundException(
        'El recurso no existe o no es visible para el usuario',
      );
    }
  }
}
