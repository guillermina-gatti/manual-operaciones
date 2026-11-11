import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService } from '../users/invitations.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { LoginDto } from './dto/login.dto';
import { RegisterWithInvitationDto } from './dto/register-with-invitation.dto';
import { ValidateInvitationResponse } from './dto/validate-invitation.response';
import { PasswordService } from './password.service';
import {
  CreateSessionResult,
  SessionMetadata,
  SessionService,
} from './session.service';
import {
  hashRefreshToken,
  REFRESH_TOKEN_BASE64URL_REGEX,
} from './token.utils';

/**
 * Tiempo de vida estándar del Access Token JWT en segundos (15 minutos = 900 s).
 */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export interface AuthUserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserSummary;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserSummary;
}

export interface LogoutResult {
  revoked: boolean;
}

export interface LogoutAllResult {
  revokedCount: number;
}

/**
 * Hash dummy bcrypt sintácticamente válido para mitigar ataques de timing
 * cuando el correo consultado no existe en la base de datos.
 */
const DUMMY_BCRYPT_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * Determina si un error P2002 de Prisma corresponde a la restricción de unicidad del email de usuario.
 */
function isUserEmailUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = error.meta?.target;
    if (Array.isArray(target) && target.includes('email')) {
      return true;
    }
    if (
      typeof target === 'string' &&
      (target.includes('email') || target.includes('users_email_key'))
    ) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly rateLimiter: AuthRateLimiterService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly invitationsService: InvitationsService,
  ) {}

  onModuleInit(): void {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new Error('JWT_SECRET no está configurada');
    }
  }

  /**
   * Inicia sesión verificando credenciales, aplicando rate limiting dual,
   * emitiendo una sesión persistida y generando un Access Token JWT de 15 minutos.
   *
   * @param dto Credenciales del usuario (email y contraseña).
   * @param metadata Metadatos opcionales de conexión (userAgent e ipAddress).
   */
  async login(dto: LoginDto, metadata?: SessionMetadata): Promise<LoginResult> {
    const email = dto.email.toLowerCase().trim();
    const ip = metadata?.ipAddress?.trim() || '127.0.0.1';

    // 1. Control de fuerza bruta mediante rate limiter dual en Redis (lanza 429 si excede, 503 si Redis cae)
    await this.rateLimiter.assertAllowed(email, ip);

    // 2. Consulta de usuario
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // 3. Verificación de contraseña (con mitigación de timing attacks si no existe usuario)
    let isPasswordValid = false;
    if (user) {
      isPasswordValid = await this.passwordService.compare(
        dto.password,
        user.passwordHash,
      );
    } else {
      await this.passwordService.compare(dto.password, DUMMY_BCRYPT_HASH);
    }

    // 4. Rechazo con mensaje idéntico e indistinguible ante credenciales inválidas o cuenta inactiva
    if (!user || !isPasswordValid || !user.isActive) {
      // Registra el intento fallido en Redis incrementando contadores atómicamente
      await this.rateLimiter.recordFailure(email, ip);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 5. Reinicio asimétrico de rate limit ante éxito (limpia cuenta+IP, preserva IP global)
    await this.rateLimiter.reset(email, ip);

    // 6. Creación y persistencia de sesión
    const sessionResult = await this.sessionService.createSession({
      userId: user.id,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });

    // 7. Generación de Access Token JWT (15 minutos)
    const secret = this.configService.get<string>('JWT_SECRET')!;
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      refreshToken: sessionResult.refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Renueva la sesión y rota el refresh token de forma atómica.
   *
   * - Si la solicitud pierde la carrera CAS condicional en vuelo (`CAS_RACE_LOST`), rechaza con HTTP 401
   *   opaco sin revocar las demás sesiones del usuario.
   * - Si se detecta reutilización confirmada de un token previamente rotado (`TOKEN_REUSE_DETECTED`),
   *   revoca y confirma todas las sesiones activas del usuario en PostgreSQL antes de responder 401.
   * - Si la revocación masiva falla en base de datos, propaga la excepción hacia el runtime sin emitir log de éxito.
   * - Verifica que el usuario permanezca activo en la base de datos.
   * - Mantiene el contrato HTTP estrictamente opaco.
   *
   * @param refreshToken Token de refresco opaco presentado por el cliente.
   * @param metadata Metadatos opcionales de conexión.
   */
  async refresh(
    refreshToken: string,
    metadata?: SessionMetadata,
  ): Promise<RefreshResult> {
    const rotation = await this.sessionService.rotateSession(
      refreshToken,
      metadata,
    );

    if (rotation.status === 'TOKEN_REUSE_DETECTED') {
      if (rotation.userId) {
        // Confirmar revocación masiva en PostgreSQL antes de responder 401
        await this.sessionService.revokeAllUserSessions(rotation.userId);
        this.logger.warn({
          message:
            'Detección de reutilización de refresh token: familia de sesiones revocada',
          userId: rotation.userId,
        });
      }
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    if (
      rotation.status !== 'SUCCESS' ||
      !rotation.newSession ||
      !rotation.newRefreshToken ||
      !rotation.userId
    ) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    // Verificar estado vigente del usuario en base de datos
    const user = await this.prisma.user.findUnique({
      where: { id: rotation.userId },
    });

    if (!user || !user.isActive) {
      await this.sessionService.revokeSession(rotation.newSession.id);
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    // Emisión del nuevo Access Token JWT
    const secret = this.configService.get<string>('JWT_SECRET')!;
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      refreshToken: rotation.newRefreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Cierra la sesión activa correspondiente al refresh token provisto.
   *
   * @param refreshToken Token de refresco de la sesión a cerrar.
   */
  async logout(refreshToken: string): Promise<LogoutResult> {
    if (
      typeof refreshToken !== 'string' ||
      !REFRESH_TOKEN_BASE64URL_REGEX.test(refreshToken)
    ) {
      return { revoked: false };
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      return { revoked: false };
    }

    const revoked = await this.sessionService.revokeSession(session.id);
    return { revoked };
  }

  /**
   * Cierra todas las sesiones activas del usuario indicado.
   *
   * @param userId Identificador único (UUID) del usuario.
   */
  async logoutAll(userId: string): Promise<LogoutAllResult> {
    const revokedCount = await this.sessionService.revokeAllUserSessions(userId);
    return { revokedCount };
  }

  /**
   * HU29: Valida públicamente un token de invitación sin exponer información sensible.
   *
   * Reglas de negocio y seguridad:
   * 1. Verifica la cuota de consultas permitidas por IP mediante AuthRateLimiterService (Fail-Closed).
   * 2. Si el token es inválido, inexistente, expirado, revocado o ya consumido, registra el intento
   *    fallido en Redis y propaga el error (400, 404, 410).
   * 3. Si el token es válido, retorna { valid: true, email, role }.
   * 4. En ningún caso escribe en logs el token ni hashes.
   */
  async validateInvitation(
    token: string,
    ip: string = '127.0.0.1',
  ): Promise<ValidateInvitationResponse> {
    const safeIp = ip.trim() || '127.0.0.1';

    // 1. Control de tasa preventivo por IP (Fail-Closed)
    await this.rateLimiter.assertInvitationValidationAllowed(safeIp);

    // 2. Validación del token de invitación
    try {
      const invitation = await this.invitationsService.validateToken(token);
      return {
        valid: true,
        email: invitation.email,
        role: invitation.role,
      };
    } catch (error) {
      // Registra el fallo de validación para esta IP
      await this.rateLimiter.recordInvitationValidationFailure(safeIp);
      throw error;
    }
  }

  /**
   * HU29: Registra un nuevo usuario consumiendo una invitación de forma atómica y creando sesión post-commit.
   *
   * Secuencia estricta y garantías de seguridad:
   * 1. Rate limiting: Comprueba cuota de IP y token (Fail-Closed).
   * 2. Pre-validación: Verifica validez del token antes del costoso cómputo criptográfico.
   * 3. Bcrypt hash: Deriva la clave fuera de la transacción para no prolongar conexiones de base de datos.
   * 4. Transacción Prisma:
   *    - Consume la invitación con CAS atómico (`InvitationsService.consumeInvitation`).
   *    - Verifica duplicados de correo electrónico.
   *    - Crea el usuario con el rol y áreas fijadas exclusivamente por la invitación (no confiando en el cliente).
   *    - Ante cualquier fallo en la transacción, revierte completamente y registra el intento fallido.
   * 5. Creación de sesión post-commit: Emite sesión en base de datos. Si falla, NO revierte el usuario ni
   *    la invitación consumida, e informa al usuario que puede iniciar sesión.
   * 6. Emisión de JWT post-sesión: Firma el Access Token. Si falla la firma, revoca la sesión recién
   *    creada para evitar sesiones huérfanas y reporta error controlado.
   * 7. En ningún caso escribe en logs contraseñas, tokens ni hashes.
   */
  async registerWithInvitation(
    dto: RegisterWithInvitationDto,
    metadata?: SessionMetadata,
  ): Promise<LoginResult> {
    const ip = metadata?.ipAddress?.trim() || '127.0.0.1';
    const token = dto.token.trim();

    // 1. Rate limiting preventivo por IP y por token (Fail-Closed)
    await this.rateLimiter.assertRegistrationAllowed(ip, token);

    // 2. Pre-validación de invitación antes del cómputo criptográfico
    try {
      await this.invitationsService.validateToken(token);
    } catch (error) {
      await this.rateLimiter.recordRegistrationFailure(ip, token);
      throw error;
    }

    // 3. Hash bcrypt ejecutado fuera y antes de la transacción de base de datos
    const passwordHash = await this.passwordService.hash(dto.password);

    // 4. Transacción atómica de base de datos (Consumo CAS + Creación de usuario + Áreas)
    let createdUser: { id: string; email: string; name: string; role: Role };
    try {
      createdUser = await this.prisma.$transaction(async (tx) => {
        // 4.1 Consumo atómico con CAS condicional de la invitación
        const invitation = await this.invitationsService.consumeInvitation(
          token,
          tx,
        );

        // 4.2 Verificación de duplicados de correo electrónico
        const existingUser = await tx.user.findUnique({
          where: { email: invitation.email },
        });
        if (existingUser) {
          throw new ConflictException(
            'Ya existe un usuario registrado con este correo electrónico',
          );
        }

        // 4.3 Creación del usuario con rol extraído exclusivamente de la invitación
        const user = await tx.user.create({
          data: {
            email: invitation.email,
            name: dto.name.trim(),
            passwordHash,
            role: invitation.role,
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        });

        // 4.4 Asignación de áreas obtenidas exclusivamente de la invitación
        if (invitation.areaIds.length > 0) {
          await tx.userArea.createMany({
            data: invitation.areaIds.map((areaId) => ({
              userId: user.id,
              areaId,
            })),
          });
        }

        return user;
      });
    } catch (error) {
      // Registra el fallo de registro para la IP y el token
      await this.rateLimiter.recordRegistrationFailure(ip, token);

      // Mapea violación de unicidad de Prisma P2002 a 409 ConflictException
      // únicamente cuando la restricción afectada corresponda al email
      if (isUserEmailUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un usuario registrado con este correo electrónico',
        );
      }

      throw error;
    }

    // 5. Creación de sesión post-commit
    let sessionResult: CreateSessionResult;
    try {
      sessionResult = await this.sessionService.createSession({
        userId: createdUser.id,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      });
    } catch {
      const incidentId = randomUUID();
      this.logger.error(
        `[${incidentId}] Fallo controlado al crear sesión en base de datos posterior al registro exitoso del usuario`,
      );
      throw new ServiceUnavailableException(
        'El registro se completó exitosamente, pero no se pudo iniciar la sesión automática. Por favor, inicie sesión con su correo y contraseña.',
      );
    }

    // 6. Emisión del Access Token JWT post-sesión
    const secret = this.configService.get<string>('JWT_SECRET')!;
    let accessToken: string;
    try {
      accessToken = await this.jwtService.signAsync(
        {
          sub: createdUser.id,
          email: createdUser.email,
          role: createdUser.role,
        },
        {
          secret,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
      );
    } catch {
      const incidentId = randomUUID();
      this.logger.error(
        `[${incidentId}] Fallo controlado al emitir Access Token posterior al registro; ejecutando revocación compensatoria de sesión`,
      );
      try {
        await this.sessionService.revokeSession(sessionResult.session.id);
      } catch {
        this.logger.error(
          `[${incidentId}] CRITICAL_INCIDENT: Falló la revocación compensatoria de la sesión huérfana tras error de JWT`,
        );
      }
      throw new ServiceUnavailableException(
        'El registro se completó exitosamente, pero no se pudo generar el token de acceso. Por favor, inicie sesión con su correo y contraseña.',
      );
    }

    return {
      accessToken,
      refreshToken: sessionResult.refreshToken,
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
      },
    };
  }
}
