import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, Roles, RolesGuard } from './index';

class TestController {
  @Roles('ADMIN')
  upload(this: void) {}
}

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => TestController.prototype.upload,
    getClass: () => TestController,
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard (simulado)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('responde 401 si faltan las cabeceras', () => {
    const guard = new JwtAuthGuard();

    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('responde 401 si el rol no es válido', () => {
    const guard = new JwtAuthGuard();
    const request = { headers: { 'x-user-id': 'u1', 'x-user-role': 'ROOT' } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('con cabeceras válidas deja pasar y carga request.user', () => {
    const guard = new JwtAuthGuard();
    const request: Record<string, unknown> = {
      headers: { 'x-user-id': 'u1', 'x-user-role': 'ADMIN' },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual({ id: 'u1', role: 'ADMIN' });
  });

  it('lanza al construirse si NODE_ENV es production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => new JwtAuthGuard()).toThrow();
  });
});

describe('RolesGuard (simulado)', () => {
  const guard = new RolesGuard(new Reflector());

  it('responde 403 si el rol no está permitido', () => {
    const request = { user: { id: 'u2', role: 'EMPLOYEE' } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      ForbiddenException,
    );
  });

  it('deja pasar a un ADMIN en una ruta con @Roles("ADMIN")', () => {
    const request = { user: { id: 'u1', role: 'ADMIN' } };

    expect(guard.canActivate(contextFor(request))).toBe(true);
  });
});
