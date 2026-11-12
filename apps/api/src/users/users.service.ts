import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
}
