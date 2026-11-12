import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth.types';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

const USER_ID = '0b000000-0000-4000-8000-000000000001';

class RolesDummyController {
  @Roles('ADMIN', 'SUPERVISOR')
  restrictedRoute(this: void) {}

  unrestrictedRoute(this: void) {}

  @Public()
  @Roles('ADMIN')
  publicRoute(this: void) {}
}

function createContext(
  request: Record<string, unknown>,
  handler: (...args: unknown[]) => unknown = RolesDummyController.prototype
    .restrictedRoute,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => RolesDummyController,
  } as unknown as ExecutionContext;
}

function makeUser(role: AuthUser['role']): AuthUser {
  return {
    id: USER_ID,
    email: 'user@empresa.com',
    name: 'Test User',
    role,
    areaIds: [],
  };
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('permite el acceso cuando el usuario autenticado tiene un rol autorizado', () => {
    const request = { user: makeUser('SUPERVISOR') };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it('rechaza con 403 ForbiddenException cuando el rol del usuario no está autorizado', () => {
    const request = {
      user: makeUser('EMPLOYEE'),
      headers: { 'x-user-role': 'ADMIN' },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
  });

  it('permite el acceso en rutas que no declaran @Roles()', () => {
    const request = { user: makeUser('EMPLOYEE') };
    const ctx = createContext(
      request,
      RolesDummyController.prototype.unrestrictedRoute,
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite el acceso en rutas marcadas con @Public()', () => {
    const request = {};
    const ctx = createContext(
      request,
      RolesDummyController.prototype.publicRoute,
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza con 403 ForbiddenException cuando la ruta exige rol pero no hay usuario autenticado en request.user', () => {
    const request = {
      headers: { 'x-user-role': 'ADMIN' },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
  });
});
