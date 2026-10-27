import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_IP_ADDRESS_LENGTH,
  MAX_USER_AGENT_LENGTH,
  SESSION_TTL_DAYS,
  SESSION_TTL_MS,
  SessionService,
  UUID_REGEX,
} from './session.service';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_BASE64URL_LENGTH,
} from './token.utils';

describe('SessionService', () => {
  let service: SessionService;
  let mockPrisma: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
  const VALID_SESSION_ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    mockPrisma = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Constantes y expresiones regulares', () => {
    it('debe definir la expiración en 7 días y su equivalente en milisegundos', () => {
      expect(SESSION_TTL_DAYS).toBe(7);
      expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('debe definir los límites máximos de columnas de userAgent (500) e ipAddress (45)', () => {
      expect(MAX_USER_AGENT_LENGTH).toBe(500);
      expect(MAX_IP_ADDRESS_LENGTH).toBe(45);
    });

    it('debe validar UUID válidos y rechazar formatos inválidos con UUID_REGEX', () => {
      expect(UUID_REGEX.test(VALID_USER_ID)).toBe(true);
      expect(UUID_REGEX.test('not-a-uuid')).toBe(false);
      expect(UUID_REGEX.test('11111111-1111-1111-1111-11111111111')).toBe(false);
      expect(UUID_REGEX.test('11111111-1111-1111-1111-1111111111111')).toBe(false);
      expect(UUID_REGEX.test('')).toBe(false);
    });
  });

  describe('createSession()', () => {
    it('debe crear una sesión válida, persistir únicamente el hash y devolver el token en texto plano una sola vez', async () => {
      const now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const fakeSessionRecord = {
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        tokenHash: 'mock-hash-deberia-ser-omitido-del-resultado',
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        isRevoked: false,
        replacedById: null,
        userAgent: 'Mozilla/5.0 Test Browser',
        ipAddress: '192.168.1.100',
        createdAt: now,
        updatedAt: now,
      };

      mockPrisma.session.create.mockResolvedValue(fakeSessionRecord);

      const result = await service.createSession({
        userId: VALID_USER_ID,
        userAgent: 'Mozilla/5.0 Test Browser',
        ipAddress: '192.168.1.100',
      });

      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).toHaveLength(REFRESH_TOKEN_BASE64URL_LENGTH);

      const expectedHash = hashRefreshToken(result.refreshToken);
      expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
      const createCallArg = mockPrisma.session.create.mock.calls[0][0];

      // Verificación de persistencia: se almacena el hash SHA-256, NUNCA el token en texto plano
      expect(createCallArg.data.userId).toBe(VALID_USER_ID);
      expect(createCallArg.data.tokenHash).toBe(expectedHash);
      expect(createCallArg.data.tokenHash).not.toBe(result.refreshToken);
      expect(createCallArg.data.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
      expect(createCallArg.data.userAgent).toBe('Mozilla/5.0 Test Browser');
      expect(createCallArg.data.ipAddress).toBe('192.168.1.100');

      // Verificación de retorno público: omite deliberadamente tokenHash
      expect(result.session).toEqual({
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        expiresAt: fakeSessionRecord.expiresAt,
        createdAt: fakeSessionRecord.createdAt,
        updatedAt: fakeSessionRecord.updatedAt,
        userAgent: 'Mozilla/5.0 Test Browser',
        ipAddress: '192.168.1.100',
      });
      expect((result.session as Record<string, unknown>).tokenHash).toBeUndefined();
    });

    it('debe aceptar userAgent e ipAddress nulos o indefinidos', async () => {
      mockPrisma.session.create.mockResolvedValue({
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        tokenHash: 'hash',
        expiresAt: new Date(),
        isRevoked: false,
        replacedById: null,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createSession({ userId: VALID_USER_ID });

      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: VALID_USER_ID,
          userAgent: null,
          ipAddress: null,
        }),
      });
    });

    it('debe rechazar userId vacío o compuesto únicamente por espacios', async () => {
      await expect(service.createSession({ userId: '' })).rejects.toThrow(
        'El identificador de usuario no puede estar vacío',
      );
      await expect(service.createSession({ userId: '   ' })).rejects.toThrow(
        'El identificador de usuario no puede estar vacío',
      );
    });

    it('debe rechazar userId si no es un UUID válido', async () => {
      await expect(service.createSession({ userId: 'no-es-un-uuid' })).rejects.toThrow(
        'El identificador de usuario debe ser un UUID válido',
      );
    });

    it('debe rechazar userAgent si supera los 500 caracteres (sin truncamiento silencioso)', async () => {
      const longUserAgent = 'A'.repeat(501);
      await expect(
        service.createSession({ userId: VALID_USER_ID, userAgent: longUserAgent }),
      ).rejects.toThrow(
        'userAgent excede la longitud máxima permitida de 500 caracteres',
      );
    });

    it('debe rechazar ipAddress si supera los 45 caracteres (sin truncamiento silencioso)', async () => {
      const longIp = 'A'.repeat(46);
      await expect(
        service.createSession({ userId: VALID_USER_ID, ipAddress: longIp }),
      ).rejects.toThrow(
        'ipAddress excede la longitud máxima permitida de 45 caracteres',
      );
    });

    it('debe propagar errores de infraestructura de Prisma al crear la sesión', async () => {
      mockPrisma.session.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('DB Connection failed', {
          code: 'P1001',
          clientVersion: '7.10.0',
        }),
      );

      await expect(service.createSession({ userId: VALID_USER_ID })).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  describe('validateSession()', () => {
    it('debe validar exitosamente una sesión activa, no revocada y no expirada', async () => {
      const now = new Date();
      const validToken = generateRefreshToken();
      const tokenHash = hashRefreshToken(validToken);

      const activeSession = {
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        tokenHash,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60), // expira en 1 hora
        isRevoked: false,
        replacedById: null,
        userAgent: 'Browser',
        ipAddress: '127.0.0.1',
        createdAt: now,
        updatedAt: now,
      };

      mockPrisma.session.findUnique.mockResolvedValue(activeSession);

      const result = await service.validateSession(validToken);

      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { tokenHash },
      });
      expect(result).toEqual({
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        expiresAt: activeSession.expiresAt,
        createdAt: activeSession.createdAt,
        updatedAt: activeSession.updatedAt,
        userAgent: 'Browser',
        ipAddress: '127.0.0.1',
      });
      expect((result as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
    });

    it('debe devolver null de forma inmediata si el token no cumple con el formato base64url', async () => {
      expect(await service.validateSession('')).toBeNull();
      expect(await service.validateSession('   ')).toBeNull();
      expect(await service.validateSession('token-invalido-corto')).toBeNull();
      expect(await service.validateSession('A'.repeat(42))).toBeNull();
      expect(await service.validateSession(`${'A'.repeat(42)}=`)).toBeNull();
      expect(await service.validateSession(null as unknown as string)).toBeNull();
      expect(await service.validateSession(undefined as unknown as string)).toBeNull();

      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('debe devolver null si la sesión no existe en la base de datos', async () => {
      const validToken = generateRefreshToken();
      mockPrisma.session.findUnique.mockResolvedValue(null);

      const result = await service.validateSession(validToken);

      expect(result).toBeNull();
      expect(mockPrisma.session.findUnique).toHaveBeenCalled();
    });

    it('debe devolver null si la sesión se encuentra revocada', async () => {
      const validToken = generateRefreshToken();
      mockPrisma.session.findUnique.mockResolvedValue({
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        tokenHash: hashRefreshToken(validToken),
        expiresAt: new Date(Date.now() + 1000 * 60),
        isRevoked: true,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.validateSession(validToken);

      expect(result).toBeNull();
    });

    it('debe devolver null si la sesión ha expirado', async () => {
      const validToken = generateRefreshToken();
      mockPrisma.session.findUnique.mockResolvedValue({
        id: VALID_SESSION_ID,
        userId: VALID_USER_ID,
        tokenHash: hashRefreshToken(validToken),
        expiresAt: new Date(Date.now() - 1000), // Expiró hace 1 segundo
        isRevoked: false,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.validateSession(validToken);

      expect(result).toBeNull();
    });

    it('debe propagar errores de infraestructura de Prisma al consultar la sesión', async () => {
      const validToken = generateRefreshToken();
      mockPrisma.session.findUnique.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Timeout', {
          code: 'P1008',
          clientVersion: '7.10.0',
        }),
      );

      await expect(service.validateSession(validToken)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  describe('revokeSession()', () => {
    it('debe revocar una sesión activa y retornar true', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.revokeSession(VALID_SESSION_ID);

      expect(result).toBe(true);
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: VALID_SESSION_ID,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
        },
      });
    });

    it('debe ser idempotente y retornar false si la sesión ya estaba revocada o no existía', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.revokeSession(VALID_SESSION_ID);

      expect(result).toBe(false);
    });

    it('debe rechazar sessionId vacío o compuesto únicamente por espacios', async () => {
      await expect(service.revokeSession('')).rejects.toThrow(
        'El identificador de sesión no puede estar vacío',
      );
      await expect(service.revokeSession('   ')).rejects.toThrow(
        'El identificador de sesión no puede estar vacío',
      );
    });

    it('debe retornar false si sessionId no cumple formato UUID sin consultar la base de datos', async () => {
      const result = await service.revokeSession('invalid-uuid');

      expect(result).toBe(false);
      expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('debe propagar errores de infraestructura de Prisma al revocar la sesión', async () => {
      mockPrisma.session.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Connection closed', {
          code: 'P1017',
          clientVersion: '7.10.0',
        }),
      );

      await expect(service.revokeSession(VALID_SESSION_ID)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  describe('revokeAllUserSessions()', () => {
    it('debe revocar todas las sesiones activas del usuario indicado y retornar la cantidad', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.revokeAllUserSessions(VALID_USER_ID);

      expect(count).toBe(3);
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: VALID_USER_ID,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
        },
      });
    });

    it('debe retornar 0 si el usuario no tenía sesiones activas', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.revokeAllUserSessions(OTHER_USER_ID);

      expect(count).toBe(0);
    });

    it('debe rechazar userId vacío o compuesto únicamente por espacios', async () => {
      await expect(service.revokeAllUserSessions('')).rejects.toThrow(
        'El identificador de usuario no puede estar vacío',
      );
      await expect(service.revokeAllUserSessions('   ')).rejects.toThrow(
        'El identificador de usuario no puede estar vacío',
      );
    });

    it('debe rechazar userId si no es un UUID válido', async () => {
      await expect(service.revokeAllUserSessions('not-a-uuid')).rejects.toThrow(
        'El identificador de usuario debe ser un UUID válido',
      );
    });

    it('debe propagar errores de infraestructura de Prisma al revocar masivamente', async () => {
      mockPrisma.session.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Pool timeout', {
          code: 'P2024',
          clientVersion: '7.10.0',
        }),
      );

      await expect(service.revokeAllUserSessions(VALID_USER_ID)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });
});
