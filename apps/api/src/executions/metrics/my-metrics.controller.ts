/* HTTP route of the personal metrics of the employee. No logic: guards and the DTO
validate the input, the service decides, and the response is mapped field by field. The
user is always the one of the session: there is no userId parameter, and the
ValidationPipe rejects any parameter that is not a filter */
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
  MyMetricsResponse,
  toMyMetricsResponse,
} from './dto/my-metrics.response';
import { MyMetricsService } from './my-metrics.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EMPLOYEE')
export class MyMetricsController {
  constructor(private readonly metrics: MyMetricsService) {}

  // GET /metrics/me: the viewer's own executions in the period and the ones to resume.
  @Get('me')
  @ApiResponse({
    status: 200,
    description: 'Only the executions of the user of the session',
    type: MyMetricsResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'areaId no es un UUID, una fecha no es AAAA-MM-DD o no existe, from es posterior a to, o hay parámetros de más',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 403,
    description: 'Solo los empleados (EMPLOYEE) tienen métricas personales',
  })
  @ApiResponse({
    status: 404,
    description: 'El área no es una de las áreas activas del usuario',
  })
  @ApiResponse({
    status: 503,
    description:
      'La base, el catálogo de procedimientos o los directorios de usuarios y áreas no responden',
  })
  async mine(
    @Query() query: ProcedureMetricsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MyMetricsResponse> {
    return toMyMetricsResponse(
      await this.metrics.mine(user, {
        areaId: query.areaId,
        from: query.from,
        to: query.to,
      }),
    );
  }
}
