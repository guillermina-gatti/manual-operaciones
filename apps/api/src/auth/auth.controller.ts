import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ROLES, type Role } from '../common/auth';
import {
  AuthService,
  type AuthUserSummary,
  type LogoutResult,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  MAX_IP_ADDRESS_LENGTH,
  MAX_USER_AGENT_LENGTH,
  SESSION_TTL_MS,
  type SessionMetadata,
} from './session.service';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';

class AuthUserSummaryResponse implements AuthUserSummary {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  name!: string;

  @ApiProperty({ example: 'usuario@empresa.com' })
  email!: string;

  @ApiProperty({ enum: ROLES, example: 'EMPLOYEE' })
  role!: Role;
}

export class LoginHttpResponse {
  @ApiProperty({
    description: 'Access Token JWT de corta duración (15 minutos)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({ type: AuthUserSummaryResponse })
  user!: AuthUserSummaryResponse;
}

export class RefreshHttpResponse {
  @ApiProperty({
    description: 'Nuevo Access Token JWT de corta duración (15 minutos)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;
}

export class LogoutHttpResponse implements LogoutResult {
  @ApiProperty({
    description: 'Indica si había una sesión activa que fue revocada',
    example: true,
  })
  revoked!: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con correo electrónico y contraseña',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa. Devuelve el Access Token JWT y establece el Refresh Token en una cookie httpOnly.',
    type: LoginHttpResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
  })
  @ApiResponse({
    status: 429,
    description:
      'Demasiados intentos fallidos de inicio de sesión (bloqueo temporal)',
  })
  @ApiResponse({
    status: 503,
    description: 'Servicio de control de tasa no disponible temporalmente',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginHttpResponse> {
    const metadata = this.extractMetadata(req);
    const result = await this.authService.login(dto, metadata);

    res.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      result.refreshToken,
      this.getRefreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Renovar el Access Token y rotar el Refresh Token mediante la cookie httpOnly',
  })
  @ApiResponse({
    status: 200,
    description:
      'Sesión renovada exitosamente. Devuelve el nuevo Access Token JWT y rota la cookie httpOnly de Refresh Token.',
    type: RefreshHttpResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Sesión inválida o expirada',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshHttpResponse> {
    const rawCookie: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    const refreshToken = typeof rawCookie === 'string' ? rawCookie : '';
    const metadata = this.extractMetadata(req);

    const result = await this.authService.refresh(refreshToken, metadata);

    res.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      result.refreshToken,
      this.getRefreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar la sesión actual revocando el Refresh Token y limpiando la cookie',
  })
  @ApiResponse({
    status: 200,
    description:
      'Cierre de sesión procesado. La cookie de Refresh Token es eliminada en el cliente.',
    type: LogoutHttpResponse,
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutHttpResponse> {
    const rawCookie: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    const refreshToken = typeof rawCookie === 'string' ? rawCookie : '';

    const result = await this.authService.logout(refreshToken);

    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.getClearCookieOptions());

    return {
      revoked: result.revoked,
    };
  }

  private extractMetadata(req: Request): SessionMetadata {
    const rawUa = req.headers?.['user-agent'];
    const userAgent =
      typeof rawUa === 'string' && rawUa.trim().length > 0
        ? rawUa.slice(0, MAX_USER_AGENT_LENGTH)
        : null;

    const rawIp =
      typeof req.ip === 'string' && req.ip.trim().length > 0
        ? req.ip.trim()
        : typeof req.socket?.remoteAddress === 'string' &&
            req.socket.remoteAddress.trim().length > 0
          ? req.socket.remoteAddress.trim()
          : '127.0.0.1';

    const ipAddress = rawIp.slice(0, MAX_IP_ADDRESS_LENGTH);

    return {
      userAgent,
      ipAddress,
    };
  }

  private isProduction(): boolean {
    const env =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    return env === 'production';
  }

  private getRefreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: SESSION_TTL_MS,
    };
  }

  private getClearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
    };
  }
}
