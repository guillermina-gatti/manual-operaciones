import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import {
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
}
