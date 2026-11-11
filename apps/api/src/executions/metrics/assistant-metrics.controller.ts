/* HTTP route of the assistant metrics (HU38, contract 5). No logic: guards and the DTO
validate the input, the service decides, and the response is mapped field by field. It
only reads the chat tables of pair C, without touching their code */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import type { AuthUser } from '../../common/auth';
import { AssistantMetricsService } from './assistant-metrics.service';
import { AssistantMetricsQueryDto } from './dto/assistant-metrics.query';
import {
  AssistantMetricsResponse,
  toAssistantMetricsResponse,
} from './dto/assistant-metrics.response';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
export class AssistantMetricsController {
  constructor(private readonly metrics: AssistantMetricsService) {}

  // GET /metrics/assistant: questions to the assistant and how they went, for the
  // people the viewer can see.
  @Get('assistant')
  @ApiResponse({
    status: 200,
    description:
      'ADMIN: every question. SUPERVISOR: the questions of the people of their areas',
    type: AssistantMetricsResponse,
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
    description: 'La base o los directorios de usuarios y áreas no responden',
  })
  async assistant(
    @Query() query: AssistantMetricsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssistantMetricsResponse> {
    return toAssistantMetricsResponse(
      await this.metrics.assistant(user, {
        areaId: query.areaId,
        from: query.from,
        to: query.to,
      }),
    );
  }
}
