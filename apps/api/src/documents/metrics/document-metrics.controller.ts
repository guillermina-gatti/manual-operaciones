/* Ruta HTTP de las métricas de documentos (spec 007, HU38). Sin lógica: los guards y el DTO validan
la entrada, el servicio decide y la respuesta se mapea campo por campo. Los guards y roles son los
de las métricas de procedimientos de la pareja B (D2) */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import type { AuthUser } from '../../common/auth';
import { DocumentMetricsService } from './document-metrics.service';
import { DocumentMetricsQueryDto } from './dto/document-metrics.query';
import {
  DocumentMetricsResponse,
  toDocumentMetricsResponse,
} from './dto/document-metrics.response';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
export class DocumentMetricsController {
  constructor(private readonly metrics: DocumentMetricsService) {}

  // GET /metrics/documents: totales de documentos activos, su estado de revisión de hoy, los que
  // tienen la versión vigente en error y los cargados en el período.
  @Get('documents')
  @ApiResponse({
    status: 200,
    description:
      'ADMIN: todas las áreas (un área que no existe da todo en 0). SUPERVISOR: sus áreas',
    type: DocumentMetricsResponse,
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
    description: 'La base o el directorio de usuarios no responden',
  })
  async documents(
    @Query() query: DocumentMetricsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentMetricsResponse> {
    return toDocumentMetricsResponse(
      await this.metrics.documents(user, {
        areaId: query.areaId,
        from: query.from,
        to: query.to,
      }),
    );
  }
}
