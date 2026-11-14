import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UUID_REGEX } from '../auth/session.service';
import type { AdminUserResponse } from './dto/admin-user.response';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserCandidateResponse } from './dto/user-candidate.response';

const UNAVAILABLE_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028']);

function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_CODES.has(error.code)
  ) return true;
  return (
    error instanceof Error &&
    !('code' in error) &&
    error.message === 'Connection terminated unexpectedly'
  );
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listOwnerCandidates(areaIds: string[]): Promise<UserCandidateResponse[]> {
    const uniqueAreaIds = [...new Set(areaIds)];
    if (uniqueAreaIds.length === 0) {
      throw new BadRequestException('areaIds es obligatorio');
    }

    try {
      // Valida el conjunto COMPLETO, incluso cuando un ADMIN sería candidato.
      const areas = await this.prisma.area.findMany({
        where: { id: { in: uniqueAreaIds } },
        select: { id: true, isActive: true },
      });
      if (areas.length !== uniqueAreaIds.length || areas.some((area) => !area.isActive)) {
        // No revela cuáles son desconocidas/inactivas a través de este catálogo de personas.
        throw new BadRequestException('areaIds: alguna de las áreas es inexistente o inactiva');
      }

      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: 'ADMIN' },
            { areas: { some: { areaId: { in: uniqueAreaIds }, area: { isActive: true } } } },
          ],
        },
        select: { id: true, name: true, role: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });

      // Respuesta reducida: no exponer emails, áreas, sesiones, isActive ni contraseñas.
      return users.map(({ id, name, role }) => ({ id, name, role }));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error({
        message: 'Falló la consulta de candidatos a responsables',
        cause: error instanceof Error ? error.message : String(error),
      });
      if (isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException(
          'No se pudieron consultar los responsables. Intentá de nuevo más tarde.',
        );
      }
      throw new InternalServerErrorException('No se pudieron consultar los responsables.');
    }
  }

  /**
   * Lista todos los usuarios de la organización con sus áreas y roles para el panel de administración.
   */
  async listAllUsersForAdmin(): Promise<AdminUserResponse[]> {
    const users = await this.prisma.user.findMany({
      include: {
        areas: {
          include: {
            area: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      areas: u.areas.map((a) => ({ id: a.area.id, name: a.area.name })),
      createdAt: u.createdAt,
    }));
  }

  /**
   * Modifica rol, áreas o estado activo de un usuario existente por parte de un ADMIN.
   */
  async updateUserByAdmin(
    adminId: string,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<AdminUserResponse> {
    if (!UUID_REGEX.test(userId)) {
      throw new BadRequestException('ID de usuario inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        areas: {
          include: {
            area: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Auto-protección de la cuenta de administrador que opera
    if (adminId === userId) {
      if (dto.isActive === false) {
        throw new BadRequestException('No podés desactivar tu propia cuenta de administrador');
      }
      if (dto.role !== undefined && dto.role !== 'ADMIN') {
        throw new BadRequestException('No podés quitarte tu propio rol de administrador');
      }
    }

    const targetRole = dto.role !== undefined ? dto.role : user.role;

    // Validación de áreas según el rol resultante
    if (dto.areaIds !== undefined) {
      if (targetRole === 'ADMIN' && dto.areaIds.length > 0) {
        throw new BadRequestException('Los administradores no deben tener áreas asignadas');
      }

      if (targetRole !== 'ADMIN') {
        if (dto.areaIds.length === 0) {
          throw new BadRequestException('Los empleados y supervisores deben tener al menos un área asignada');
        }

        const areas = await this.prisma.area.findMany({
          where: { id: { in: dto.areaIds } },
          select: { id: true, isActive: true },
        });

        if (areas.length !== dto.areaIds.length || areas.some((a) => !a.isActive)) {
          throw new BadRequestException('Una o más áreas son inexistentes o están inactivas');
        }
      }
    } else if (dto.role !== undefined && dto.role !== user.role) {
      // Cambio de rol sin especificar áreas
      if (targetRole !== 'ADMIN' && user.areas.length === 0) {
        throw new BadRequestException('Debés asignar al menos un área al cambiar el rol a supervisor o empleado');
      }
    }

    // Protección del último administrador activo del sistema
    if (user.role === 'ADMIN' && (targetRole !== 'ADMIN' || dto.isActive === false)) {
      const activeAdminsCount = await this.prisma.user.count({
        where: {
          role: 'ADMIN',
          isActive: true,
          id: { not: userId },
        },
      });

      if (activeAdminsCount === 0) {
        throw new ConflictException(
          'No se puede desactivar ni modificar el rol del único administrador activo del sistema',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Si se especificaron áreas o el nuevo rol es ADMIN (se vacían)
      if (dto.areaIds !== undefined || targetRole === 'ADMIN') {
        const newAreaIds = targetRole === 'ADMIN' ? [] : dto.areaIds!;
        await tx.userArea.deleteMany({ where: { userId } });
        if (newAreaIds.length > 0) {
          await tx.userArea.createMany({
            data: newAreaIds.map((areaId) => ({ userId, areaId })),
          });
        }
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          role: targetRole,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: {
          areas: {
            include: {
              area: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });

      // Si se desactiva, invalidar sus sesiones activas
      if (dto.isActive === false) {
        await tx.session.deleteMany({ where: { userId } });
      }

      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        areas: updated.areas.map((a) => ({ id: a.area.id, name: a.area.name })),
        createdAt: updated.createdAt,
      };
    });
  }
}
