// Simulación de la autenticación hasta que la otra pareja entregue la real (plan 5.1).
// Al reemplazarla, este archivo pasa a reexportar los guards y decoradores reales.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
}

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JwtAuthGuard simulado: no se puede usar en producción');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const id = request.headers['x-user-id'];
    const role = request.headers['x-user-role'];

    if (typeof id !== 'string' || id === '' || !isRole(role)) {
      throw new UnauthorizedException();
    }

    request.user = { id, role };
    return true;
  }
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;

    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<AuthRequest>().user,
);
