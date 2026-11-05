import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { UUID_REGEX } from '../auth/session.service';
import { UserCandidateResponse } from './dto/user-candidate.response';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // Permiso confirmado por Equipo C para consulta de candidatos.
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'Candidatos activos de las áreas solicitadas y administradores activos',
    type: UserCandidateResponse,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'areaIds ausente, mal formado, inexistente o inactivo; parámetros no admitidos' })
  @ApiResponse({ status: 401, description: 'Sin autenticación o cuenta solicitante inactiva' })
  @ApiResponse({ status: 403, description: 'La consulta de candidatos está restringida a ADMIN' })
  @ApiResponse({ status: 503, description: 'La base de datos no responde' })
  listCandidates(@Query() query: Record<string, unknown>): Promise<UserCandidateResponse[]> {
    // Solo areaIds, repetido una vez por UUID; sin CSV, filtros, búsqueda ni paginación.
    if (Object.keys(query).length !== 1 || !Object.prototype.hasOwnProperty.call(query, 'areaIds')) {
      throw new BadRequestException('areaIds es obligatorio y no se admiten otros parámetros');
    }

    const raw = query.areaIds;
    const ids: unknown[] = Array.isArray(raw) ? raw : [raw];
    if (
      ids.length === 0 ||
      ids.some((id) => typeof id !== 'string' || !UUID_REGEX.test(id))
    ) {
      throw new BadRequestException('areaIds: se requiere uno o más UUID válidos, en parámetros repetidos');
    }

    // No se confía en el frontend: el servicio valida TODOS los IDs contra áreas activas.
    return this.users.listOwnerCandidates(ids as string[]);
  }
}
