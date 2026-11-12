import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import type { AuthUser } from '../common/auth';
import { UUID_REGEX } from '../auth/session.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponse } from './dto/invitation.response';
import { UserCandidateResponse } from './dto/user-candidate.response';
import { InvitationDeliveryService } from './invitation-delivery.service';
import { InvitationsService } from './invitations.service';
import { UsersService } from './users.service';

/**
 * Resuelve y valida la URL base del frontend para componer enlaces de invitación.
 * - En development y test permite http: y https:, con fallback a http://localhost:3001 si no está configurada.
 * - En cualquier otro entorno (production, staging, etc.), FRONTEND_URL es obligatoria y exige estrictamente https:.
 * - Rechaza URLs con credenciales (username o password), query string o fragmento.
 * - Cualquier configuración inválida produce HTTP 503 antes de llamar a createInvitation().
 * - Nunca utiliza el encabezado Host de la solicitud.
 */
function resolveFrontendBaseUrl(configService: ConfigService): string {
  const nodeEnv = configService.get<string>('NODE_ENV');
  const isLocalEnv = nodeEnv === 'development' || nodeEnv === 'test';
  const rawUrl = configService.get<string>('FRONTEND_URL')?.trim();

  if (!rawUrl) {
    if (isLocalEnv) {
      return 'http://localhost:3001';
    }
    throw new ServiceUnavailableException(
      'La variable de entorno FRONTEND_URL es obligatoria en este entorno',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ServiceUnavailableException(
      'FRONTEND_URL debe ser una URL absoluta válida',
    );
  }

  // Validación de protocolo según entorno
  if (isLocalEnv) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ServiceUnavailableException(
        `Protocolo de FRONTEND_URL no permitido en desarrollo/test: ${parsed.protocol}`,
      );
    }
  } else {
    if (parsed.protocol !== 'https:') {
      throw new ServiceUnavailableException(
        `Protocolo de FRONTEND_URL no permitido en este entorno (se requiere https): ${parsed.protocol}`,
      );
    }
  }

  // Rechazar credenciales (username o password)
  if (parsed.username || parsed.password) {
    throw new ServiceUnavailableException(
      'FRONTEND_URL no debe incluir credenciales de usuario',
    );
  }

  // Rechazar query string o fragmento (incluyendo delimitadores '?' o '#' en la cadena original sin contenido posterior)
  if (rawUrl.includes('?') || rawUrl.includes('#') || parsed.search || parsed.hash) {
    throw new ServiceUnavailableException(
      'FRONTEND_URL no debe contener parámetros de consulta ni fragmentos',
    );
  }

  return rawUrl.replace(/\/+$/, '');
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // Permiso confirmado por Equipo C para consulta de candidatos e invitaciones.
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly users: UsersService,
    private readonly invitationsService: InvitationsService,
    private readonly deliveryService: InvitationDeliveryService,
    private readonly configService: ConfigService,
  ) {}

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

  @Post('invitations')
  @Roles('ADMIN')
  @ApiResponse({
    status: 201,
    description: 'Invitación creada correctamente',
    type: InvitationResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Email, rol o áreas inválidas',
  })
  @ApiResponse({
    status: 401,
    description: 'Usuario no autenticado o sesión inválida',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuario autenticado sin rol ADMIN',
  })
  @ApiResponse({
    status: 409,
    description: 'Usuario existente o invitación pendiente vigente',
  })
  @ApiResponse({
    status: 503,
    description: 'El servicio de entrega no está disponible',
  })
  async createInvitation(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<InvitationResponse> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isLocal = nodeEnv === 'development' || nodeEnv === 'test';

    // 1. En producción, staging o sin proveedor configurado, verificar canal antes de crear/persistir
    this.deliveryService.assertReady();

    // 2. Resolver y validar FRONTEND_URL estrictamente según el entorno (nunca usar Host header)
    const frontendBaseUrl = resolveFrontendBaseUrl(this.configService);

    // 3. Crear invitación en el servicio de negocio
    const result = await this.invitationsService.createInvitation({
      email: dto.email,
      role: dto.role,
      areaIds: dto.areaIds ?? [],
      createdById: admin.id,
    });

    const invitationUrl = `${frontendBaseUrl}/registro#token=${result.rawToken}`;

    // 4. Entregar invitación mediante el canal configurado y validar el resultado
    let deliveryResult;
    try {
      deliveryResult = await this.deliveryService.deliver({
        email: result.invitation.email,
        role: result.invitation.role,
        token: result.rawToken,
        invitationUrl,
      });

      // Validación estricta del resultado de entrega:
      // - canal local solo es válido en development o test, con delivered: false y con invitationUrl.
      // - canal email solo es válido si delivered: true.
      // - cualquier otra combinación se considera fallo de entrega y desencadena la revocación.
      const isLocalChannelValid =
        isLocal &&
        deliveryResult.channel === 'local' &&
        deliveryResult.delivered === false &&
        Boolean(deliveryResult.invitationUrl);

      const isEmailChannelValid =
        deliveryResult.channel === 'email' && deliveryResult.delivered === true;

      if (!isLocalChannelValid && !isEmailChannelValid) {
        throw new ServiceUnavailableException(
          'El canal o resultado de entrega de la invitación no es válido para este entorno',
        );
      }
    } catch (deliveryError) {
      // Intento de revocación de contingencia
      try {
        await this.invitationsService.revokeInvitation(result.invitation.id);
      } catch (revokeError) {
        this.logger.error(
          `Fallo crítico de contingencia: no se pudo revocar la invitación ${result.invitation.id} tras el fallo de entrega`,
          revokeError instanceof Error ? revokeError.stack : revokeError,
        );
        throw revokeError;
      }

      if (deliveryError instanceof ServiceUnavailableException) {
        throw deliveryError;
      }

      throw new ServiceUnavailableException(
        'El servicio de entrega de invitaciones no está disponible',
      );
    }

    return {
      id: result.invitation.id,
      email: result.invitation.email,
      role: result.invitation.role,
      areaIds: result.invitation.areaIds,
      expiresAt: result.invitation.expiresAt,
      createdAt: result.invitation.createdAt,
      invitationUrl: isLocal ? deliveryResult.invitationUrl : undefined,
    };
  }
}
