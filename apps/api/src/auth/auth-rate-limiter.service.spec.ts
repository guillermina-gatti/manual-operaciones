import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  ACCOUNT_IP_MAX_ATTEMPTS,
  AuthRateLimiterService,
  BLOCK_WINDOW_SECONDS,
  GLOBAL_IP_MAX_ATTEMPTS,
  RECORD_FAILURE_LUA_SCRIPT,
} from './auth-rate-limiter.service';

describe('AuthRateLimiterService', () => {
  let service: AuthRateLimiterService;
  let mockRedis: jest.Mocked<Partial<Redis>>;
  let loggerErrorSpy: jest.SpyInstance;

  const validEmail = 'usuario.prueba@empresa.com';
  const validIpv4 = '192.168.1.50';
  const validIpv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';

  beforeEach(() => {
    mockRedis = {
      mget: jest.fn(),
      ttl: jest.fn(),
      eval: jest.fn(),
      del: jest.fn(),
    };

    service = new AuthRateLimiterService(mockRedis as unknown as Redis);
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constantes y configuración', () => {
    it('debe tener los umbrales y ventanas estipulados', () => {
      expect(ACCOUNT_IP_MAX_ATTEMPTS).toBe(5);
      expect(GLOBAL_IP_MAX_ATTEMPTS).toBe(50);
      expect(BLOCK_WINDOW_SECONDS).toBe(900);
      expect(service.accountIpMaxAttempts).toBe(5);
      expect(service.globalIpMaxAttempts).toBe(50);
      expect(service.blockWindowSeconds).toBe(900);
    });
  });

  describe('Normalización de correo y generación de claves', () => {
    it('debe normalizar el email (trim y minúsculas) y calcular hash SHA-256 idéntico', () => {
      const email1 = '  Usuario.Prueba@Empresa.COM  ';
      const email2 = 'usuario.prueba@empresa.com';

      const hash1 = service.hashEmail(email1);
      const hash2 = service.hashEmail(email2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });

    it('las claves generadas no deben contener el correo en texto plano', () => {
      const keyAcc = service.getAccountIpKey(validEmail, validIpv4);
      const keyIp = service.getGlobalIpKey(validIpv4);

      expect(keyAcc).not.toContain(validEmail);
      expect(keyAcc).toContain(service.hashEmail(validEmail));
      expect(keyAcc).toContain(validIpv4);
      expect(keyIp).toBe(`rl:auth:ip:${validIpv4}`);
    });
  });

  describe('Validación de entradas (IP y Email)', () => {
    it('debe lanzar BadRequestException si el email es inválido, vacío o excede 255 caracteres', async () => {
      await expect(service.assertAllowed('', validIpv4)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.assertAllowed(null as unknown as string, validIpv4),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.assertAllowed('a'.repeat(256) + '@empresa.com', validIpv4),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si la IP no es válida según node:net isIP', async () => {
      const invalidIps = [
        '',
        'not-an-ip',
        '999.999.999.999',
        '192.168.1.1\nINCR evil',
        '123.456',
      ];

      for (const ip of invalidIps) {
        await expect(service.assertAllowed(validEmail, ip)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.recordFailure(validEmail, ip)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.reset(validEmail, ip)).rejects.toThrow(
          BadRequestException,
        );
      }
    });

    it('debe aceptar direcciones IPv4 e IPv6 válidas', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue([null, null]);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).resolves.toBeUndefined();
      await expect(
        service.assertAllowed(validEmail, validIpv6),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertAllowed() y semántica de límites', () => {
    it('debe permitir la solicitud cuando no existen intentos previos registrados', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue([null, null]);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).resolves.toBeUndefined();
      expect(mockRedis.mget).toHaveBeenCalledWith(
        service.getAccountIpKey(validEmail, validIpv4),
        service.getGlobalIpKey(validIpv4),
      );
    });

    it('debe permitir la solicitud si los intentos están por debajo de los umbrales (ej. 4 de cuenta y 40 de IP)', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue(['4', '40']);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).resolves.toBeUndefined();
    });

    it('debe bloquear con HTTP 429 (ACCOUNT_IP) cuando los intentos de cuenta+IP alcanzan el límite de 5', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue(['5', '10']);
      (mockRedis.ttl as jest.Mock).mockResolvedValue(720); // 12 minutos restantes

      try {
        await service.assertAllowed(validEmail, validIpv4);
        fail('Se esperaba que lanzara HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpError = err as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);

        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.statusCode).toBe(429);
        expect(response.limitType).toBe('ACCOUNT_IP');
        expect(response.retryAfter).toBe(720);
        expect(response.message).toContain('para esta cuenta');
        expect(response.message).toContain('12 minutos');
      }
    });

    it('debe bloquear con HTTP 429 (GLOBAL_IP) cuando los intentos globales por IP alcanzan el límite de 50', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue(['1', '50']);
      (mockRedis.ttl as jest.Mock).mockResolvedValue(540); // 9 minutos restantes

      try {
        await service.assertAllowed(validEmail, validIpv4);
        fail('Se esperaba que lanzara HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpError = err as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);

        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.statusCode).toBe(429);
        expect(response.limitType).toBe('GLOBAL_IP');
        expect(response.retryAfter).toBe(540);
        expect(response.message).toContain('desde esta dirección IP');
        expect(response.message).toContain('9 minutos');
      }
    });

    it('debe priorizar el bloqueo de ACCOUNT_IP si ambos contadores están en o por encima de sus límites', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue(['5', '50']);
      (mockRedis.ttl as jest.Mock).mockResolvedValue(600);

      try {
        await service.assertAllowed(validEmail, validIpv4);
        fail('Se esperaba que lanzara HttpException');
      } catch (err) {
        const httpError = err as HttpException;
        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.limitType).toBe('ACCOUNT_IP');
      }
    });

    it('debe utilizar BLOCK_WINDOW_SECONDS (900 s) por defecto si el TTL devuelto por Redis es <= 0', async () => {
      (mockRedis.mget as jest.Mock).mockResolvedValue(['6', '0']);
      (mockRedis.ttl as jest.Mock).mockResolvedValue(-2); // clave expiró concurrentemente o no tiene TTL

      try {
        await service.assertAllowed(validEmail, validIpv4);
        fail('Se esperaba que lanzara HttpException');
      } catch (err) {
        const httpError = err as HttpException;
        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.retryAfter).toBe(BLOCK_WINDOW_SECONDS);
        expect(response.message).toContain('15 minutos');
      }
    });

    it('debe aplicar Fail-Closed y lanzar ServiceUnavailableException (HTTP 503) si Redis falla', async () => {
      const redisError = new Error('getaddrinfo ENOTFOUND redis-cluster');
      (mockRedis.mget as jest.Mock).mockRejectedValue(redisError);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Manejo Fail-Closed ante contadores inválidos recibidos desde Redis', () => {
    it.each([
      ['cadena de texto no numérica', 'abc', '0'],
      ['notación hexadecimal', '0x10', '0'],
      ['notación binaria', '0b10', '0'],
      ['notación exponencial', '1e2', '0'],
      ['número superior al entero seguro', '9007199254740992', '0'],
      ['número negativo', '-1', '0'],
      ['cadena vacía', '', '0'],
      ['número decimal fraccionario', '2.5', '0'],
      ['NaN explícito', 'NaN', '0'],
      ['valor inválido en contador de IP', '0', 'invalido'],
      ['ambos contadores inválidos', 'error', 'falla'],
    ])(
      'debe fallar de forma cerrada con HTTP 503 cuando el contador es %s',
      async (_desc, accVal, ipVal) => {
        (mockRedis.mget as jest.Mock).mockResolvedValue([accVal, ipVal]);

        await expect(
          service.assertAllowed(validEmail, validIpv4),
        ).rejects.toThrow(ServiceUnavailableException);

        expect(loggerErrorSpy).toHaveBeenCalled();
      },
    );

    it.each([
      ['cero', '0', '0'],
      ['un intento', '1', '1'],
      ['cuatro intentos', '4', '40'],
    ])(
      'debe procesar exitosamente contadores decimales válidos (%s)',
      async (_desc, accVal, ipVal) => {
        (mockRedis.mget as jest.Mock).mockResolvedValue([accVal, ipVal]);

        await expect(
          service.assertAllowed(validEmail, validIpv4),
        ).resolves.toBeUndefined();
      },
    );
  });

  describe('recordFailure()', () => {
    it('debe ejecutar el script Lua atómico pasando ambas claves y el TTL', async () => {
      (mockRedis.eval as jest.Mock).mockResolvedValue([1, 1]);

      await service.recordFailure(validEmail, validIpv4);

      expect(mockRedis.eval).toHaveBeenCalledWith(
        RECORD_FAILURE_LUA_SCRIPT,
        2,
        service.getAccountIpKey(validEmail, validIpv4),
        service.getGlobalIpKey(validIpv4),
        '900',
      );
    });

    it('debe aplicar Fail-Closed si Redis falla durante el incremento atómico', async () => {
      const redisError = new Error('ECONNREFUSED 127.0.0.1:6379');
      (mockRedis.eval as jest.Mock).mockRejectedValue(redisError);

      await expect(
        service.recordFailure(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('debe aplicar Fail-Closed si el script Lua devuelve error explícito de Redis (ej. ERR_FAILED_EXPIRE_ACC)', async () => {
      const luaError = new Error('ERR_FAILED_EXPIRE_ACC');
      (mockRedis.eval as jest.Mock).mockRejectedValue(luaError);

      await expect(
        service.recordFailure(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('debe aplicar Fail-Closed si el script Lua devuelve error de expiración de IP (ERR_FAILED_EXPIRE_IP)', async () => {
      const luaError = new Error('ERR_FAILED_EXPIRE_IP');
      (mockRedis.eval as jest.Mock).mockRejectedValue(luaError);

      await expect(
        service.recordFailure(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('reset() y asimetría de restablecimiento', () => {
    it('debe eliminar única y exclusivamente la clave de cuenta+IP, dejando intacta la IP global', async () => {
      (mockRedis.del as jest.Mock).mockResolvedValue(1);

      await service.reset(validEmail, validIpv4);

      const expectedAccKey = service.getAccountIpKey(validEmail, validIpv4);
      const expectedIpKey = service.getGlobalIpKey(validIpv4);

      expect(mockRedis.del).toHaveBeenCalledWith(expectedAccKey);
      expect(mockRedis.del).not.toHaveBeenCalledWith(expectedIpKey);
    });

    it('debe aplicar Fail-Closed y lanzar HTTP 503 si Redis falla durante reset', async () => {
      (mockRedis.del as jest.Mock).mockRejectedValue(new Error('Connection lost'));

      await expect(service.reset(validEmail, validIpv4)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Aislamiento entre cuentas e IPs (No filtración de estado)', () => {
    it('fallos en cuenta A desde IP 1 no deben afectar a cuenta B desde la misma IP en el límite de cuenta', async () => {
      const emailA = 'cuenta.a@empresa.com';
      const emailB = 'cuenta.b@empresa.com';

      const keyA = service.getAccountIpKey(emailA, validIpv4);
      const keyB = service.getAccountIpKey(emailB, validIpv4);

      expect(keyA).not.toBe(keyB);

      // Simular que cuenta A tiene 5 fallos, pero cuenta B tiene 0
      (mockRedis.mget as jest.Mock).mockImplementation((k1: string) => {
        if (k1 === keyA) return Promise.resolve(['5', '5']);
        if (k1 === keyB) return Promise.resolve(['0', '5']);
        return Promise.resolve([null, null]);
      });
      (mockRedis.ttl as jest.Mock).mockResolvedValue(900);

      // Cuenta A se bloquea
      await expect(service.assertAllowed(emailA, validIpv4)).rejects.toThrow(
        HttpException,
      );

      // Cuenta B se permite (su contador cuenta+IP es 0 y el global de IP es 5 < 50)
      await expect(
        service.assertAllowed(emailB, validIpv4),
      ).resolves.toBeUndefined();
    });
  });

  describe('Sanitización y seguridad de Logs (Sin fuga de PII ni datos sensibles)', () => {
    it('debe sanitizar códigos de error no reconocidos registrando estrictamente REDIS_ERROR', async () => {
      const sensitiveCodeError = new Error('Database password leaked');
      (sensitiveCodeError as { code?: string }).code =
        'SUPER_SECRET_TOKEN_12345';

      (mockRedis.mget as jest.Mock).mockRejectedValue(sensitiveCodeError);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      const loggedPayload = loggerErrorSpy.mock.calls[0][0];

      expect(loggedPayload.errorCode).toBe('REDIS_ERROR');
      expect(JSON.stringify(loggedPayload)).not.toContain(
        'SUPER_SECRET_TOKEN_12345',
      );
    });

    it('debe registrar el código de error legítimo si pertenece a la lista blanca segura', async () => {
      const safeError = new Error('Connection refused');
      (safeError as { code?: string }).code = 'ECONNREFUSED';

      (mockRedis.mget as jest.Mock).mockRejectedValue(safeError);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      const loggedPayload = loggerErrorSpy.mock.calls[0][0];

      expect(loggedPayload.errorCode).toBe('ECONNREFUSED');
    });

    it('los logs de error no deben contener el correo electrónico, la IP ni el mensaje crudo con datos internos', async () => {
      const sensitiveInternalError = new Error(
        `Failed connection to redis://admin:SecretPass123@internal-redis.cluster:6379 for user ${validEmail}`,
      );
      (sensitiveInternalError as { code?: string }).code = 'ECONNREFUSED';

      (mockRedis.mget as jest.Mock).mockRejectedValue(sensitiveInternalError);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      const loggedPayload = loggerErrorSpy.mock.calls[0][0];

      expect(loggedPayload).toEqual({
        message: expect.stringContaining('Falla en servicio de Redis'),
        errorType: 'Error',
        errorCode: 'ECONNREFUSED',
      });

      const loggedString = JSON.stringify(loggedPayload);
      expect(loggedString).not.toContain(validEmail);
      expect(loggedString).not.toContain('SecretPass123');
      expect(loggedString).not.toContain('internal-redis.cluster');
    });

    it('debe registrar errorType como "Error" o "UnknownError" de forma estática y controlada', async () => {
      class SensitiveCustomFailure extends Error {
        override name = 'SensitiveInternalCustomError';
      }
      const customError = new SensitiveCustomFailure('Internal failure');

      (mockRedis.mget as jest.Mock).mockRejectedValue(customError);

      await expect(
        service.assertAllowed(validEmail, validIpv4),
      ).rejects.toThrow(ServiceUnavailableException);

      const loggedPayload = loggerErrorSpy.mock.calls[0][0];
      expect(loggedPayload.errorType).toBe('Error');
      expect(JSON.stringify(loggedPayload)).not.toContain(
        'SensitiveInternalCustomError',
      );
    });
  });

  describe('Integración real con contenedor Redis local (Docker Compose)', () => {
    let realRedis: Redis | null = null;
    let redisConnected = false;

    beforeAll(async () => {
      try {
        const client = new Redis('redis://127.0.0.1:6379', {
          connectTimeout: 1000,
          commandTimeout: 1000,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        realRedis = client;
        await client.connect();
        await client.ping();
        redisConnected = true;
      } catch {
        redisConnected = false;
        if (realRedis) {
          try {
            realRedis.disconnect();
          } catch {
            // ignorar fallo de desconexión en teardown
          }
          realRedis = null;
        }
      }
    });

    afterAll(async () => {
      if (realRedis) {
        try {
          await realRedis.quit();
        } catch {
          realRedis.disconnect();
        } finally {
          realRedis = null;
        }
      }
    });

    it('debe ejecutar el script atómico con snapshot y fijar TTL en ambos contadores con Redis real', async () => {
      if (!redisConnected || !realRedis) {
        throw new Error(
          'Prueba de integración fallida: el servicio de Redis local (127.0.0.1:6379) no está disponible.',
        );
      }

      const runId = randomUUID();
      const testAccKey = `test:rl:auth:acc_ip:${runId}`;
      const testIpKey = `test:rl:auth:ip:${runId}`;

      try {
        const result = (await realRedis.eval(
          RECORD_FAILURE_LUA_SCRIPT,
          2,
          testAccKey,
          testIpKey,
          900,
        )) as [number, number];

        expect(result).toEqual([1, 1]);

        const ttlAcc = await realRedis.ttl(testAccKey);
        const ttlIp = await realRedis.ttl(testIpKey);

        expect(ttlAcc).toBeGreaterThan(0);
        expect(ttlAcc).toBeLessThanOrEqual(900);
        expect(ttlIp).toBeGreaterThan(0);
        expect(ttlIp).toBeLessThanOrEqual(900);
      } finally {
        await realRedis.del(testAccKey, testIpKey);
      }
    });

    it('debe incrementar y preservar expiraciones en claves preexistentes y asignar TTL en claves sin TTL previo', async () => {
      if (!redisConnected || !realRedis) {
        throw new Error(
          'Prueba de integración fallida: el servicio de Redis local (127.0.0.1:6379) no está disponible.',
        );
      }

      const runId = randomUUID();
      const testAccKey = `test:rl:auth:acc_ip:${runId}`;
      const testIpKey = `test:rl:auth:ip:${runId}`;

      try {
        // Establecer testAccKey con valor 2 y TTL=-1 (sin expiración intencional)
        await realRedis.set(testAccKey, '2');
        expect(await realRedis.ttl(testAccKey)).toBe(-1);

        const result = (await realRedis.eval(
          RECORD_FAILURE_LUA_SCRIPT,
          2,
          testAccKey,
          testIpKey,
          900,
        )) as [number, number];

        // testAccKey pasa de 2 a 3; testIpKey se inicializa en 1
        expect(result).toEqual([3, 1]);

        // Ambos contadores ahora deben tener TTL válido (900 s)
        const ttlAcc = await realRedis.ttl(testAccKey);
        const ttlIp = await realRedis.ttl(testIpKey);

        expect(ttlAcc).toBeGreaterThan(0);
        expect(ttlAcc).toBeLessThanOrEqual(900);
        expect(ttlIp).toBeGreaterThan(0);
        expect(ttlIp).toBeLessThanOrEqual(900);
      } finally {
        await realRedis.del(testAccKey, testIpKey);
      }
    });

    it('la pre-validación de tipos debe abortar sin mutar contadores si una clave tiene tipo incompatible', async () => {
      if (!redisConnected || !realRedis) {
        throw new Error(
          'Prueba de integración fallida: el servicio de Redis local (127.0.0.1:6379) no está disponible.',
        );
      }

      const runId = randomUUID();
      const testListKey = `test:rl:list:${runId}`;
      const testIpKey = `test:rl:ip:${runId}`;

      try {
        await realRedis.rpush(testListKey, 'item');

        // Intentar ejecutar el script Lua con una clave que es de tipo lista
        await expect(
          realRedis.eval(
            RECORD_FAILURE_LUA_SCRIPT,
            2,
            testListKey,
            testIpKey,
            900,
          ),
        ).rejects.toThrow('ERR_INVALID_KEY_TYPE_ACC');

        // Verificar que la segunda clave (testIpKey) NO fue modificada ni creada
        const ipExists = await realRedis.exists(testIpKey);
        expect(ipExists).toBe(0);
      } finally {
        await realRedis.del(testListKey, testIpKey);
      }
    });
  });
});
