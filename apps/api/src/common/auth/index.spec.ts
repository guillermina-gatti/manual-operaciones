import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessService,
  CurrentUser,
  IS_PUBLIC_KEY,
  JwtAuthGuard,
  Public,
  ROLES_KEY,
  Roles,
  RolesGuard,
} from './index';

const USER_ID = '0b000000-0000-4000-8000-000000000001';
const AREA_VENTAS = '0a000000-0000-4000-8000-000000000001';
const JWT_SECRET = 'test-secret-common-auth-2026';

class TestController {
  @Roles('ADMIN')
  upload(this: void) {}

  @Public()
  health(this: void) {}
}

const contextFor = (
  request: Record<string, unknown>,
  handler: (...args: unknown[]) => unknown = TestController.prototype.upload,
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  }) as unknown as ExecutionContext;

describe('Exportaciones públicas de src/common/auth', () => {
  it('reexporta JwtAuthGuard, RolesGuard, AccessService y los decoradores reales', () => {
    expect(JwtAuthGuard).toBeDefined();
    expect(RolesGuard).toBeDefined();
    expect(AccessService).toBeDefined();
    expect(Public).toBeDefined();
    expect(Roles).toBeDefined();
    expect(CurrentUser).toBeDefined();
    expect(IS_PUBLIC_KEY).toBe('isPublic');
    expect(ROLES_KEY).toBe('roles');
  });

  it('JwtAuthGuard rechaza con 401 cabeceras simuladas x-user-id / x-user-role y exige Bearer JWT real', async () => {
    const jwtService = new JwtService();
    const configService = {
      get: jest.fn().mockReturnValue(JWT_SECRET),
    } as unknown as ConfigService;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: USER_ID,
          email: 'admin@empresa.com',
          name: 'Admin',
          role: 'ADMIN',
          isActive: true,
          areas: [{ areaId: AREA_VENTAS }],
        }),
      },
    } as unknown as PrismaService;

    const guard = new JwtAuthGuard(
      jwtService,
      configService,
      prisma,
      new Reflector(),
    );

    await expect(
      guard.canActivate(
        contextFor({
          headers: { 'x-user-id': USER_ID, 'x-user-role': 'ADMIN' },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    const token = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: JWT_SECRET, expiresIn: 900 },
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: USER_ID,
      email: 'admin@empresa.com',
      name: 'Admin',
      role: 'ADMIN',
      areaIds: [AREA_VENTAS],
    });
  });

  it('RolesGuard verifica el rol de request.user y rechaza roles no autorizados con 403', () => {
    const guard = new RolesGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        contextFor({
          user: {
            id: USER_ID,
            email: 'emp@empresa.com',
            name: 'Emp',
            role: 'EMPLOYEE',
            areaIds: [],
          },
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        contextFor({
          user: {
            id: USER_ID,
            email: 'admin@empresa.com',
            name: 'Admin',
            role: 'ADMIN',
            areaIds: [],
          },
        }),
      ),
    ).toBe(true);
  });
});
