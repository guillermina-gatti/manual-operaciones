/* HTTP route of the procedures metrics (HU38, contract 5). No logic: guards and the
DTO validate the input, the service decides, and the response is mapped field by
field. Pair C exposes /metrics/assistant and /metrics/documents in their own module */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import type { AuthUser } from '../../common/auth';
import { ProcedureMetricsQueryDto } from './dto/procedure-metrics.query';
import {
  ProceduresMetricsResponse,
  toProceduresMetricsResponse,
} from './dto/procedure-metrics.response';
import { ProcedureMetricsService } from './procedure-metrics.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
export class ProcedureMetricsController {
  constructor(private readonly metrics: ProcedureMetricsService) {}

  // GET /metrics/procedures: executions per procedure, average time and abandonment
  // per step, for the procedures the viewer can see.
  @Get('procedures')
  @ApiResponse({
    status: 200,
    description:
      'ADMIN: every procedure. SUPERVISOR: the procedures of their areas',
    type: ProceduresMetricsResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'areaId no es un UUID, una fecha no es AAAA-MM-DD o no existe, from es posterior a to, o hay parámetros de más',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 403,
    description: 'El rol no puede ver métricas (EMPLOYEE)',
  })
  @ApiResponse({
    status: 404,
    description: 'Un SUPERVISOR pidió un área que no es suya',
  })
  @ApiResponse({
    status: 503,
    description:
      'La base, el catálogo de procedimientos o el directorio de usuarios no responden',
  })
  async procedures(
    @Query() query: ProcedureMetricsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProceduresMetricsResponse> {
    return toProceduresMetricsResponse(
      await this.metrics.procedures(user, {
        areaId: query.areaId,
        from: query.from,
        to: query.to,
      }),
    );
  }
}
