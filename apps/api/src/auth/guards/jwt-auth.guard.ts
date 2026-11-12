import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { type AuthRequest, isRole } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UUID_REGEX } from '../session.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = undefined;

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('No autenticado');
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new UnauthorizedException('No autenticado');
    }

    let userId: string;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(
        token,
        { secret },
      );

      if (
        typeof payload?.sub !== 'string' ||
        !UUID_REGEX.test(payload.sub.trim())
      ) {
        throw new UnauthorizedException('No autenticado');
      }
      userId = payload.sub.trim();
    } catch {
      throw new UnauthorizedException('No autenticado');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        areas: {
          where: {
            area: { isActive: true },
          },
          select: { areaId: true },
        },
      },
    });

    if (!dbUser || !dbUser.isActive || !isRole(dbUser.role)) {
      throw new UnauthorizedException('No autenticado');
    }

    request.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      areaIds: dbUser.areas.map((relation) => relation.areaId),
    };

    return true;
  }

  private extractBearerToken(request: AuthRequest): string | null {
    const authHeader = request.headers?.['authorization'];
    if (typeof authHeader !== 'string') {
      return null;
    }

    const trimmed = authHeader.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 2) {
      return null;
    }

    const [scheme, token] = parts;
    if (scheme.toLowerCase() !== 'bearer' || token.length === 0) {
      return null;
    }

    return token;
  }
}
