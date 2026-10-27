import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { generateRefreshToken } from './token.utils';

describe('AuthService', () => {
  let service: AuthService;

  let mockPrisma: {
    user: {
      findUnique: jest.Mock;
    };
    session: {
      findUnique: jest.Mock;
    };
  };

  let mockPasswordService: {
    compare: jest.Mock;
  };

  let mockRateLimiter: {
    assertAllowed: jest.Mock;
    recordFailure: jest.Mock;
    reset: jest.Mock;
  };

  let mockSessionService: {
    createSession: jest.Mock;
    rotateSession: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllUserSessions: jest.Mock;
  };

  let mockJwtService: {
    signAsync: jest.Mock;
  };

  let mockConfigService: {
    get: jest.Mock;
  };

  const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';
  const VALID_SESSION_ID = '22222222-2222-4222-8222-222222222222';
  const NEW_SESSION_ID = '33333333-3333-4333-8333-333333333333';
  const MOCK_JWT_SECRET = 'test-jwt-secret-key-for-auth-service-2026';

  const mockUser = {
    id: VALID_USER_ID,
    name: 'Juan Perez',
    email: 'juan.perez@example.com',
    passwordHash: '$2b$10$hashedpasswordforexampleuser',
    role: 'EMPLOYEE' as const,
    isActive: true,
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      session: {
        findUnique: jest.fn(),
      },
    };

    mockPasswordService = {
      compare: jest.fn(),
    };

    mockRateLimiter = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };

    mockSessionService = {
      createSession: jest.fn(),
      rotateSession: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllUserSessions: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-signed-jwt-token'),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return MOCK_JWT_SECRET;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AuthRateLimiterService, useValue: mockRateLimiter },
        { provide: SessionService, useValue: mockSessionService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit()', () => {
    it('debe inicializar correctamente si JWT_SECRET está configurada', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('debe lanzar un Error en arranque si JWT_SECRET no está configurada o está vacía', () => {
      mockConfigService.get.mockReturnValue('');
      expect(() => service.onModuleInit()).toThrow('JWT_SECRET no está configurada');

      mockConfigService.get.mockReturnValue(undefined);
      expect(() => service.onModuleInit()).toThrow('JWT_SECRET no está configurada');
    });
  });

  describe('login()', () => {
    const loginDto = {
      email: 'juan.perez@example.com',
      password: 'MiPassword123!',
    };

    const metadata = {
      userAgent: 'Mozilla/5.0 Agent',
      ipAddress: '192.168.1.50',
    };

    it('debe autenticar exitosamente, reiniciar rate limit, crear sesión y emitir JWT', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValue(true);

      const fakeRefreshToken = generateRefreshToken();
      mockSessionService.createSession.mockResolvedValue({
        refreshToken: fakeRefreshToken,
        session: {
          id: VALID_SESSION_ID,
          userId: VALID_USER_ID,
          expiresAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      });

      const result = await service.login(loginDto, metadata);

      // Verificación de llamadas
      expect(mockRateLimiter.assertAllowed).toHaveBeenCalledWith(
        'juan.perez@example.com',
        '192.168.1.50',
      );
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'juan.perez@example.com' },
      });
      expect(mockPasswordService.compare).toHaveBeenCalledWith(
        'MiPassword123!',
        mockUser.passwordHash,
      );
      expect(mockRateLimiter.reset).toHaveBeenCalledWith(
        'juan.perez@example.com',
        '192.168.1.50',
      );
      expect(mockSessionService.createSession).toHaveBeenCalledWith({
        userId: VALID_USER_ID,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        {
          sub: VALID_USER_ID,
          email: mockUser.email,
          role: mockUser.role,
        },
        {
          secret: MOCK_JWT_SECRET,
          expiresIn: 900,
        },
      );

      // Verificación de retorno
      expect(result).toEqual({
        accessToken: 'mock-signed-jwt-token',
        refreshToken: fakeRefreshToken,
        user: {
          id: VALID_USER_ID,
          name: 'Juan Perez',
          email: 'juan.perez@example.com',
          role: 'EMPLOYEE',
        },
      });

      // No debe exponer hashes internos
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(mockRateLimiter.recordFailure).not.toHaveBeenCalled();
    });

    it('debe rechazar con HTTP 429 si el rate limit de intentos se excede', async () => {
      mockRateLimiter.assertAllowed.mockRejectedValue(
        new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: 'Demasiados intentos fallidos',
            retryAfter: 450,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      const promise = service.login(loginDto, metadata);

      await expect(promise).rejects.toThrow(HttpException);
      await expect(promise).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPasswordService.compare).not.toHaveBeenCalled();
    });

    it('debe propagar HTTP 503 si el servicio de rate limiter falla (Redis caído)', async () => {
      mockRateLimiter.assertAllowed.mockRejectedValue(
        new HttpException('Redis caído', HttpStatus.SERVICE_UNAVAILABLE),
      );

      await expect(service.login(loginDto, metadata)).rejects.toThrow(
        HttpException,
      );
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('debe rechazar con "Credenciales inválidas" si el usuario no existe y registrar fallo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto, metadata)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );

      // Comprobación de mitigación de timing attack (dummy compare)
      expect(mockPasswordService.compare).toHaveBeenCalledWith(
        'MiPassword123!',
        expect.stringMatching(/^\$2[ab]\$/),
      );
      expect(mockRateLimiter.recordFailure).toHaveBeenCalledWith(
        'juan.perez@example.com',
        '192.168.1.50',
      );
      expect(mockRateLimiter.reset).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('debe rechazar con "Credenciales inválidas" si la contraseña es errónea y registrar fallo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.compare.mockResolvedValue(false);

      await expect(service.login(loginDto, metadata)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );

      expect(mockRateLimiter.recordFailure).toHaveBeenCalledWith(
        'juan.perez@example.com',
        '192.168.1.50',
      );
      expect(mockRateLimiter.reset).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('debe rechazar con "Credenciales inválidas" si el usuario está inactivo (isActive: false) y registrar fallo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      mockPasswordService.compare.mockResolvedValue(true);

      // El mensaje debe ser idéntico al de contraseña errónea para evitar enumeración de estado
      await expect(service.login(loginDto, metadata)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );

      expect(mockRateLimiter.recordFailure).toHaveBeenCalledWith(
        'juan.perez@example.com',
        '192.168.1.50',
      );
      expect(mockRateLimiter.reset).not.toHaveBeenCalled();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh()', () => {
    const rawToken = generateRefreshToken();
    const metadata = { userAgent: 'New Browser', ipAddress: '10.0.0.1' };

    it('debe renovar exitosamente y devolver nuevo par de tokens', async () => {
      const newRefreshToken = generateRefreshToken();

      mockSessionService.rotateSession.mockResolvedValue({
        status: 'SUCCESS',
        userId: VALID_USER_ID,
        newRefreshToken,
        newSession: {
          id: NEW_SESSION_ID,
          userId: VALID_USER_ID,
          expiresAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refresh(rawToken, metadata);

      expect(mockSessionService.rotateSession).toHaveBeenCalledWith(
        rawToken,
        metadata,
      );
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: VALID_USER_ID },
      });
      expect(mockJwtService.signAsync).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'mock-signed-jwt-token',
        refreshToken: newRefreshToken,
      });
    });

    it('debe revocar masivamente las sesiones del usuario ante TOKEN_REUSE_DETECTED y responder 401', async () => {
      mockSessionService.rotateSession.mockResolvedValue({
        status: 'TOKEN_REUSE_DETECTED',
        userId: VALID_USER_ID,
      });

      await expect(service.refresh(rawToken, metadata)).rejects.toThrow(
        new UnauthorizedException('Sesión inválida o expirada'),
      );

      // Verificación de revocación masiva confirmada en PostgreSQL
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        VALID_USER_ID,
      );
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('debe propagar el error si revokeAllUserSessions falla durante TOKEN_REUSE_DETECTED sin emitir log de éxito ni 401 artificial', async () => {
      mockSessionService.rotateSession.mockResolvedValue({
        status: 'TOKEN_REUSE_DETECTED',
        userId: VALID_USER_ID,
      });
      mockSessionService.revokeAllUserSessions.mockRejectedValue(
        new Error('Fallo crítico en PostgreSQL'),
      );

      await expect(service.refresh(rawToken, metadata)).rejects.toThrow(
        'Fallo crítico en PostgreSQL',
      );
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('debe rechazar con 401 ante CAS_RACE_LOST sin revocar la familia de sesiones', async () => {
      mockSessionService.rotateSession.mockResolvedValue({
        status: 'CAS_RACE_LOST',
        userId: VALID_USER_ID,
      });

      await expect(service.refresh(rawToken, metadata)).rejects.toThrow(
        new UnauthorizedException('Sesión inválida o expirada'),
      );

      // NO debe revocar la familia de sesiones ante pérdida de carrera CAS
      expect(mockSessionService.revokeAllUserSessions).not.toHaveBeenCalled();
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('debe responder con un mensaje de error estrictamente opaco en 401', async () => {
      mockSessionService.rotateSession.mockResolvedValue({
        status: 'CAS_RACE_LOST',
        userId: VALID_USER_ID,
      });

      try {
        await service.refresh(rawToken, metadata);
        throw new Error('Debería haber lanzado UnauthorizedException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse();
        expect(response).toEqual({
          statusCode: 401,
          message: 'Sesión inválida o expirada',
          error: 'Unauthorized',
        });
      }
    });

    it('debe rechazar con 401 si el token es inválido o expiró', async () => {
      mockSessionService.rotateSession.mockResolvedValue({
        status: 'INVALID_TOKEN',
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(
        new UnauthorizedException('Sesión inválida o expirada'),
      );

      expect(mockSessionService.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('debe revocar la nueva sesión y rechazar si el usuario fue desactivado en DB durante la rotación', async () => {
      mockSessionService.rotateSession.mockResolvedValue({
        status: 'SUCCESS',
        userId: VALID_USER_ID,
        newRefreshToken: generateRefreshToken(),
        newSession: { id: NEW_SESSION_ID },
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(
        new UnauthorizedException('Sesión inválida o expirada'),
      );

      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(NEW_SESSION_ID);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('logout()', () => {
    it('debe revocar la sesión si el token es válido y existe', async () => {
      const rawToken = generateRefreshToken();

      mockPrisma.session.findUnique.mockResolvedValue({
        id: VALID_SESSION_ID,
      });
      mockSessionService.revokeSession.mockResolvedValue(true);

      const result = await service.logout(rawToken);

      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(VALID_SESSION_ID);
      expect(result).toEqual({ revoked: true });
    });

    it('debe retornar revoked: false si el formato de token es inválido sin consultar la base de datos', async () => {
      const result = await service.logout('invalid-token');

      expect(result).toEqual({ revoked: false });
      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('debe retornar revoked: false si la sesión no existe en base de datos', async () => {
      const rawToken = generateRefreshToken();
      mockPrisma.session.findUnique.mockResolvedValue(null);

      const result = await service.logout(rawToken);

      expect(result).toEqual({ revoked: false });
      expect(mockSessionService.revokeSession).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll()', () => {
    it('debe revocar todas las sesiones del usuario y retornar la cantidad', async () => {
      mockSessionService.revokeAllUserSessions.mockResolvedValue(4);

      const result = await service.logoutAll(VALID_USER_ID);

      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(
        VALID_USER_ID,
      );
      expect(result).toEqual({ revokedCount: 4 });
    });
  });
});
