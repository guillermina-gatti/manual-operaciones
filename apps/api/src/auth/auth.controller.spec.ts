import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  AuthController,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from './auth.controller';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  MAX_IP_ADDRESS_LENGTH,
  MAX_USER_AGENT_LENGTH,
  SESSION_TTL_MS,
} from './session.service';
import { generateRefreshToken } from './token.utils';

describe('AuthController', () => {
  let controller: AuthController;

  let mockAuthService: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  let mockConfigService: {
    get: jest.Mock;
  };

  const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';

  const mockUserSummary = {
    id: VALID_USER_ID,
    name: 'Juan Pérez',
    email: 'juan.perez@empresa.com',
    role: 'EMPLOYEE' as const,
  };

  function createMockRequest(options?: {
    ip?: string;
    remoteAddress?: string;
    userAgent?: string;
    cookies?: Record<string, unknown>;
  }): Request {
    return {
      ip: options?.ip,
      socket: {
        remoteAddress: options?.remoteAddress,
      },
      headers:
        options?.userAgent !== undefined
          ? { 'user-agent': options.userAgent }
          : {},
      cookies: options?.cookies,
    } as unknown as Request;
  }

  function createMockResponse(): {
    res: Response;
    cookieMock: jest.Mock;
    clearCookieMock: jest.Mock;
  } {
    const cookieMock = jest.fn();
    const clearCookieMock = jest.fn();
    return {
      res: {
        cookie: cookieMock,
        clearCookie: clearCookieMock,
      } as unknown as Response,
      cookieMock,
      clearCookieMock,
    };
  }

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('development'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    const loginDto: LoginDto = {
      email: 'juan.perez@empresa.com',
      password: 'MiPasswordSegura123!',
    };

    it('debe autenticar al usuario, delegar en AuthService, configurar la cookie httpOnly y no exponer el refreshToken en JSON', async () => {
      const fakeRefreshToken = generateRefreshToken();
      mockAuthService.login.mockResolvedValue({
        accessToken: 'jwt-access-token-15m',
        refreshToken: fakeRefreshToken,
        user: mockUserSummary,
      });

      const req = createMockRequest({
        ip: '192.168.1.25',
        userAgent: 'Mozilla/5.0 TestBrowser',
      });
      const { res, cookieMock } = createMockResponse();

      const response = await controller.login(loginDto, req, res);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, {
        ipAddress: '192.168.1.25',
        userAgent: 'Mozilla/5.0 TestBrowser',
      });

      expect(cookieMock).toHaveBeenCalledTimes(1);
      expect(cookieMock).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        fakeRefreshToken,
        {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: REFRESH_TOKEN_COOKIE_PATH,
          maxAge: SESSION_TTL_MS,
        },
      );

      expect(response).toEqual({
        accessToken: 'jwt-access-token-15m',
        user: mockUserSummary,
      });
      expect(
        (response as unknown as Record<string, unknown>).refreshToken,
      ).toBeUndefined();
    });

    it('debe marcar la cookie con secure: true cuando NODE_ENV es production', async () => {
      mockConfigService.get.mockReturnValue('production');
      const fakeRefreshToken = generateRefreshToken();
      mockAuthService.login.mockResolvedValue({
        accessToken: 'jwt-access-token-prod',
        refreshToken: fakeRefreshToken,
        user: mockUserSummary,
      });

      const req = createMockRequest({ ip: '10.0.0.5' });
      const { res, cookieMock } = createMockResponse();

      await controller.login(loginDto, req, res);

      expect(cookieMock).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        fakeRefreshToken,
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: REFRESH_TOKEN_COOKIE_PATH,
          maxAge: SESSION_TTL_MS,
        },
      );
    });

    it('debe extraer IP desde socket.remoteAddress o usar 127.0.0.1 si req.ip no está disponible, y recortar user-agent largos', async () => {
      const fakeRefreshToken = generateRefreshToken();
      mockAuthService.login.mockResolvedValue({
        accessToken: 'jwt-token',
        refreshToken: fakeRefreshToken,
        user: mockUserSummary,
      });

      const oversizedUserAgent = 'U'.repeat(MAX_USER_AGENT_LENGTH + 120);
      const oversizedIp = '1'.repeat(MAX_IP_ADDRESS_LENGTH + 20);
      const reqWithSocket = createMockRequest({
        remoteAddress: oversizedIp,
        userAgent: oversizedUserAgent,
      });
      const { res } = createMockResponse();

      await controller.login(loginDto, reqWithSocket, res);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, {
        ipAddress: '1'.repeat(MAX_IP_ADDRESS_LENGTH),
        userAgent: 'U'.repeat(MAX_USER_AGENT_LENGTH),
      });

      const reqEmpty = createMockRequest({});
      await controller.login(loginDto, reqEmpty, res);

      expect(mockAuthService.login).toHaveBeenLastCalledWith(loginDto, {
        ipAddress: '127.0.0.1',
        userAgent: null,
      });
    });

    it('debe propagar UnauthorizedException (401) sin emitir cookie cuando las credenciales son inválidas', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Credenciales inválidas'),
      );

      const req = createMockRequest({ ip: '192.168.1.25' });
      const { res, cookieMock } = createMockResponse();

      await expect(controller.login(loginDto, req, res)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );

      expect(cookieMock).not.toHaveBeenCalled();
    });

    it('debe propagar HttpException (429) y ServiceUnavailableException (503) sin emitir cookie', async () => {
      mockAuthService.login.mockRejectedValueOnce(
        new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      );

      const req = createMockRequest({ ip: '192.168.1.25' });
      const { res, cookieMock } = createMockResponse();

      await expect(controller.login(loginDto, req, res)).rejects.toThrow(
        HttpException,
      );
      expect(cookieMock).not.toHaveBeenCalled();

      mockAuthService.login.mockRejectedValueOnce(
        new ServiceUnavailableException('Servicio no disponible'),
      );

      await expect(controller.login(loginDto, req, res)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(cookieMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('debe rotar el refreshToken desde la cookie, emitir la nueva cookie y devolver solo accessToken', async () => {
      const incomingToken = generateRefreshToken();
      const rotatedToken = generateRefreshToken();

      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'new-jwt-access-token',
        refreshToken: rotatedToken,
      });

      const req = createMockRequest({
        ip: '10.0.0.12',
        userAgent: 'Chrome/130.0',
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: incomingToken },
      });
      const { res, cookieMock } = createMockResponse();

      const response = await controller.refresh(req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(incomingToken, {
        ipAddress: '10.0.0.12',
        userAgent: 'Chrome/130.0',
      });

      expect(cookieMock).toHaveBeenCalledTimes(1);
      expect(cookieMock).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        rotatedToken,
        {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: REFRESH_TOKEN_COOKIE_PATH,
          maxAge: SESSION_TTL_MS,
        },
      );

      expect(response).toEqual({
        accessToken: 'new-jwt-access-token',
      });
      expect(
        (response as unknown as Record<string, unknown>).refreshToken,
      ).toBeUndefined();
    });

    it('debe rechazar con 401 opaco sin emitir nueva cookie si la rotación falla o la cookie no existe', async () => {
      mockAuthService.refresh.mockRejectedValue(
        new UnauthorizedException('Sesión inválida o expirada'),
      );

      const reqWithoutCookie = createMockRequest({
        ip: '10.0.0.12',
      });
      const { res, cookieMock } = createMockResponse();

      await expect(
        controller.refresh(reqWithoutCookie, res),
      ).rejects.toThrow(new UnauthorizedException('Sesión inválida o expirada'));

      expect(mockAuthService.refresh).toHaveBeenCalledWith('', {
        ipAddress: '10.0.0.12',
        userAgent: null,
      });
      expect(cookieMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('debe revocar la sesión en AuthService y limpiar la cookie con los mismos atributos de ruta y seguridad', async () => {
      const activeToken = generateRefreshToken();
      mockAuthService.logout.mockResolvedValue({ revoked: true });

      const req = createMockRequest({
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: activeToken },
      });
      const { res, clearCookieMock } = createMockResponse();

      const response = await controller.logout(req, res);

      expect(mockAuthService.logout).toHaveBeenCalledWith(activeToken);
      expect(clearCookieMock).toHaveBeenCalledTimes(1);
      expect(clearCookieMock).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: REFRESH_TOKEN_COOKIE_PATH,
      });
      expect(response).toEqual({ revoked: true });
    });

    it('debe comportarse de forma idempotente y borrar la cookie aunque no exista cookie entrante', async () => {
      mockAuthService.logout.mockResolvedValue({ revoked: false });

      const req = createMockRequest({});
      const { res, clearCookieMock } = createMockResponse();

      const response = await controller.logout(req, res);

      expect(mockAuthService.logout).toHaveBeenCalledWith('');
      expect(clearCookieMock).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: REFRESH_TOKEN_COOKIE_PATH,
      });
      expect(response).toEqual({ revoked: false });
    });
  });

  describe('Integración de contenedor DI en AuthModule', () => {
    it('debe resolver AuthController y AuthService con todos sus proveedores reales dentro de AuthModule', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ JWT_SECRET: 'test-secret-for-di-check' })],
          }),
          {
            module: class FakeGlobalInfraModule {},
            global: true,
            providers: [
              { provide: PrismaService, useValue: {} },
              { provide: REDIS_CLIENT, useValue: {} },
            ],
            exports: [PrismaService, REDIS_CLIENT],
          },
          AuthModule,
        ],
      }).compile();

      const resolvedController = moduleRef.get(AuthController);
      const resolvedService = moduleRef.get(AuthService);

      expect(resolvedController).toBeInstanceOf(AuthController);
      expect(resolvedService).toBeInstanceOf(AuthService);
    });
  });
});
