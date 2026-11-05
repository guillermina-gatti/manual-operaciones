/* Rutas HTTP de las alertas de documentos contradictorios (spec 011, R14, R15). Sin lógica: los guards y
los DTO validan la entrada y el servicio decide. Solo el ADMIN (D11) */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import type { AuthUser } from '../../common/auth';
import { ConflictAlertsService } from './conflict-alerts.service';
import {
  ConflictAlertListResponse,
  ConflictAlertResponse,
} from './dto/conflict-alert.response';
import { ListConflictAlertsQuery } from './dto/list-conflict-alerts.query';
import { ResolveConflictAlertDto } from './dto/resolve-conflict-alert.dto';

const UNAVAILABLE = 'La base o el directorio de usuarios no responden';

@ApiTags('conflict-alerts')
@ApiBearerAuth()
@Controller('conflict-alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ConflictAlertsController {
  constructor(private readonly alerts: ConflictAlertsService) {}

  // GET /conflict-alerts: las abiertas (o las resueltas), paginadas, con el total de abiertas.
  @Get()
  @ApiResponse({ status: 200, type: ConflictAlertListResponse })
  @ApiResponse({
    status: 400,
    description: 'status, page o limit inválidos, o parámetros de más',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 403, description: 'El rol no es ADMIN' })
  @ApiResponse({ status: 503, description: UNAVAILABLE })
  list(
    @Query() query: ListConflictAlertsQuery,
  ): Promise<ConflictAlertListResponse> {
    return this.alerts.list({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  // POST /conflict-alerts/:id/resolve: "Marcar como resuelta", con una nota opcional.
  @Post(':id/resolve')
  @HttpCode(200)
  @ApiResponse({ status: 200, type: ConflictAlertResponse })
  @ApiResponse({
    status: 400,
    description: 'El id no es un UUID, o la nota pasa de 500 caracteres',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 403, description: 'El rol no es ADMIN' })
  @ApiResponse({ status: 404, description: 'No se encontró la alerta' })
  @ApiResponse({ status: 409, description: 'La alerta ya está resuelta' })
  @ApiResponse({ status: 503, description: UNAVAILABLE })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveConflictAlertDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConflictAlertResponse> {
    return this.alerts.resolve(id, user, { note: body.note });
  }
}
