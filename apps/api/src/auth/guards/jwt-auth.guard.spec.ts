import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const USER_ID = '0b000000-0000-4000-8000-000000000003';
const AREA_VENTAS = '0a000000-0000-4000-8000-000000000001';
const AREA_OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const JWT_SECRET = 'test-jwt-secret-for-guard-2026';

class ProtectedDummyController {
  protectedRoute(this: void) {}

  @Public()
  publicRoute(this: void) {}
}

function createContext(
  request: Record<string, unknown>,
  handler: (...args: unknown[]) => unknown = ProtectedDummyController.prototype
    .protectedRoute,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => ProtectedDummyController,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let mockConfigService: { get: jest.Mock };
  let mockPrisma: { user: { findUnique: jest.Mock } };
  let reflector: Reflector;

  beforeEach(() => {
    jwtService = new JwtService();
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return JWT_SECRET;
        return undefined;
      }),
    };
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    reflector = new Reflector();

    guard = new JwtAuthGuard(
      jwtService,
      mockConfigService as unknown as ConfigService,
      mockPrisma as unknown as PrismaService,
      reflector,
    );
  });

  it('permite el paso en rutas decoradas con @Public() sin exigir token ni consultar DB', async () => {
    const request: Record<string, unknown> = { headers: {} };
    const ctx = createContext(
      request,
      ProtectedDummyController.prototype.publicRoute,
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('valida un Bearer token firmado y carga request.user desde PostgreSQL', async () => {
    const token = await jwtService.signAsync(
      { sub: USER_ID, email: 'viejo@empresa.com', role: 'EMPLOYEE' },
      { secret: JWT_SECRET, expiresIn: 900 },
    );

    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'actual@empresa.com',
      name: 'Juan Pérez',
      role: 'EMPLOYEE',
      isActive: true,
      areas: [{ areaId: AREA_VENTAS }],
    });

    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        areas: {
          where: { area: { isActive: true } },
          select: { areaId: true },
        },
      },
    });

    expect(request.user).toEqual({
      id: USER_ID,
      email: 'actual@empresa.com',
      name: 'Juan Pérez',
      role: 'EMPLOYEE',
      areaIds: [AREA_VENTAS],
    });
  });

  it('refleja cambios de rol y áreas ocurridos en PostgreSQL sin confiar en los claims del JWT', async () => {
    // El JWT fue emitido cuando era SUPERVISOR, pero en DB ahora es EMPLOYEE y cambió de área
    const token = await jwtService.signAsync(
      { sub: USER_ID, email: 'user@empresa.com', role: 'SUPERVISOR' },
      { secret: JWT_SECRET, expiresIn: 900 },
    );

    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'user@empresa.com',
      name: 'Usuario Reasignado',
      role: 'EMPLOYEE',
      isActive: true,
      areas: [{ areaId: AREA_OPERACIONES }],
    });

    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: USER_ID,
      email: 'user@empresa.com',
      name: 'Usuario Reasignado',
      role: 'EMPLOYEE',
      areaIds: [AREA_OPERACIONES],
    });
  });

  it('rechaza con 401 si el encabezado Authorization está ausente', async () => {
    const request: Record<string, unknown> = { headers: {} };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con 401 y no confía en encabezados x-user-id o x-user-role enviados por el cliente', async () => {
    const request: Record<string, unknown> = {
      headers: {
        'x-user-id': USER_ID,
        'x-user-role': 'ADMIN',
      },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con 401 si el token es malformado, tiene firma inválida o está expirado', async () => {
    const wrongSignatureToken = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: 'wrong-secret', expiresIn: 900 },
    );
    const expiredToken = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: JWT_SECRET, expiresIn: -10 },
    );

    for (const header of [
      'Basic dXNlcjpwYXNz',
      'Bearer',
      'Bearer token-malformado',
      `Bearer ${wrongSignatureToken}`,
      `Bearer ${expiredToken}`,
    ]) {
      const request: Record<string, unknown> = {
        headers: { authorization: header },
      };
      await expect(guard.canActivate(createContext(request))).rejects.toThrow(
        UnauthorizedException,
      );
    }

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con 401 sin consultar Prisma si el JWT es válido pero sub no es un UUID', async () => {
    const nonUuidSubToken = await jwtService.signAsync(
      { sub: 'no-es-uuid' },
      { secret: JWT_SECRET, expiresIn: 900 },
    );

    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${nonUuidSubToken}` },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con 401 si el usuario del token no existe en PostgreSQL', async () => {
    const token = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: JWT_SECRET, expiresIn: 900 },
    );
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('rechaza con 401 si el usuario está inactivo (isActive: false) aunque su JWT no haya expirado', async () => {
    const token = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: JWT_SECRET, expiresIn: 900 },
    );
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'inactivo@empresa.com',
      name: 'Inactivo',
      role: 'ADMIN',
      isActive: false,
      areas: [],
    });

    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });
});
