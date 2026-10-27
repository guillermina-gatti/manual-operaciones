import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisModule } from './redis.module';

describe('RedisModule', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Proveedor REDIS_CLIENT (fábrica de cliente)', () => {
    it('debe instanciar el cliente Redis con las opciones requeridas', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ REDIS_URL: 'redis://localhost:6379' })],
          }),
          RedisModule,
        ],
      }).compile();

      const client = moduleRef.get<Redis>(REDIS_CLIENT);
      try {
        expect(client).toBeInstanceOf(Redis);
        expect(client.options.lazyConnect).toBe(true);
        expect(client.options.connectTimeout).toBe(2000);
        expect(client.options.commandTimeout).toBe(1500);
        expect(client.options.enableOfflineQueue).toBe(false);
        expect(client.options.maxRetriesPerRequest).toBe(1);
      } finally {
        client.disconnect();
      }
    });

    it('debe leer REDIS_URL provisto por ConfigService', async () => {
      const customUrl = 'redis://custom-redis-host:6380';
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ REDIS_URL: customUrl })],
          }),
          RedisModule,
        ],
      }).compile();

      const client = moduleRef.get<Redis>(REDIS_CLIENT);
      try {
        expect(client.options.host).toBe('custom-redis-host');
        expect(client.options.port).toBe(6380);
      } finally {
        client.disconnect();
      }
    });

    it('debe utilizar redis://localhost:6379 por defecto si ConfigService no define REDIS_URL', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({})],
          }),
          RedisModule,
        ],
      }).compile();

      const client = moduleRef.get<Redis>(REDIS_CLIENT);
      try {
        expect(client.options.host).toBe('localhost');
        expect(client.options.port).toBe(6379);
      } finally {
        client.disconnect();
      }
    });
  });

  describe('Listener de eventos de error', () => {
    let client: Redis;
    let loggerErrorSpy: jest.SpyInstance;

    beforeEach(async () => {
      loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ REDIS_URL: 'redis://localhost:6379' })],
          }),
          RedisModule,
        ],
      }).compile();

      client = moduleRef.get<Redis>(REDIS_CLIENT);
    });

    afterEach(() => {
      try {
        client.disconnect();
      } catch {
        // Ignorar errores durante desconexión de limpieza
      }
    });

    it('debe registrar y permitir códigos de error seguros en la lista blanca', () => {
      const safeCodes = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'NR_CLOSED',
        'CONNECTION_BROKEN',
        'UNCERTAIN_STATE',
      ];

      for (const code of safeCodes) {
        loggerErrorSpy.mockClear();
        const err = Object.assign(new Error(`Error con código ${code}`), { code });
        client.emit('error', err);

        expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
        expect(loggerErrorSpy).toHaveBeenCalledWith({
          message: 'Evento de error en conexión o comando de Redis',
          errorType: 'Error',
          errorCode: code,
        });
      }
    });

    it('debe sanitizar códigos desconocidos mapeándolos a REDIS_ERROR', () => {
      const errWithUnknownCode = Object.assign(new Error('Fallo no clasificado'), {
        code: 'UNEXPECTED_INTERNAL_CODE',
      });
      client.emit('error', errWithUnknownCode);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith({
        message: 'Evento de error en conexión o comando de Redis',
        errorType: 'Error',
        errorCode: 'REDIS_ERROR',
      });
    });

    it('debe sanitizar a REDIS_ERROR cuando el error no contiene propiedad code', () => {
      const errWithoutCode = new Error('Error simple sin código');
      client.emit('error', errWithoutCode);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith({
        message: 'Evento de error en conexión o comando de Redis',
        errorType: 'Error',
        errorCode: 'REDIS_ERROR',
      });
    });

    it('debe clasificar como UnknownError si el evento emitido no es instancia de Error', () => {
      const nonErrorPayload = { code: 'ECONNREFUSED', custom: 'payload' };
      client.emit('error', nonErrorPayload);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith({
        message: 'Evento de error en conexión o comando de Redis',
        errorType: 'UnknownError',
        errorCode: 'ECONNREFUSED',
      });
    });
  });

  describe('onModuleDestroy() (Ciclo de vida y apagado)', () => {
    it('debe cerrar limpiamente con quit() si resuelve antes del timeout sin invocar disconnect()', async () => {
      const mockRedis = {
        quit: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn(),
      };

      const module = new RedisModule(mockRedis as unknown as Redis);
      await module.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
      expect(mockRedis.disconnect).not.toHaveBeenCalled();
    });

    it('debe invocar disconnect() como fallback si quit() rechaza', async () => {
      const mockRedis = {
        quit: jest.fn().mockRejectedValue(new Error('Connection closed')),
        disconnect: jest.fn(),
      };

      const module = new RedisModule(mockRedis as unknown as Redis);
      await module.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
    });

    it('debe invocar disconnect() como fallback si quit() excede el timeout de 1000 ms', async () => {
      jest.useFakeTimers();

      let resolveQuit: ((val?: unknown) => void) | undefined;
      const quitPromise = new Promise((resolve) => {
        resolveQuit = resolve;
      });

      const mockRedis = {
        quit: jest.fn().mockReturnValue(quitPromise),
        disconnect: jest.fn(),
      };

      const module = new RedisModule(mockRedis as unknown as Redis);
      const destroyPromise = module.onModuleDestroy();

      // Avanzamos el temporizador virtual en 1000 ms para disparar el timeout
      jest.advanceTimersByTime(1000);

      await destroyPromise;

      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);

      // Resolver promesa pendiente para evitar advertencias de temporizadores o promesas colgadas
      resolveQuit?.();
    });

    it('debe limpiar el temporizador mediante clearTimeout tanto en éxito como en fallo', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Caso éxito
      const successRedis = {
        quit: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn(),
      };
      const successModule = new RedisModule(successRedis as unknown as Redis);
      await successModule.onModuleDestroy();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

      clearTimeoutSpy.mockClear();

      // Caso fallo
      const failureRedis = {
        quit: jest.fn().mockRejectedValue(new Error('Fallo inmediato')),
        disconnect: jest.fn(),
      };
      const failureModule = new RedisModule(failureRedis as unknown as Redis);
      await failureModule.onModuleDestroy();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('no debe arrojar excepciones si this.redis es nulo o indefinido', async () => {
      const moduleWithNull = new RedisModule(null as unknown as Redis);
      await expect(moduleWithNull.onModuleDestroy()).resolves.toBeUndefined();

      const moduleWithUndefined = new RedisModule(undefined as unknown as Redis);
      await expect(moduleWithUndefined.onModuleDestroy()).resolves.toBeUndefined();
    });

    describe('Comportamiento determinista según el estado del cliente (aislado con mocks)', () => {
      it('en estado wait simulado, quit() rechaza y se activa disconnect() como fallback', async () => {
        const mockRedis = {
          status: 'wait',
          quit: jest
            .fn()
            .mockRejectedValue(
              new Error("Stream isn't writeable and enableOfflineQueue options is false"),
            ),
          disconnect: jest.fn().mockImplementation(function (this: { status: string }) {
            this.status = 'end';
          }),
        };

        const module = new RedisModule(mockRedis as unknown as Redis);
        await module.onModuleDestroy();

        expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
        expect(mockRedis.status).toBe('end');
      });

      it('en estado close simulado, quit() rechaza y disconnect() se ejecuta como fallback', async () => {
        const mockRedis = {
          status: 'close',
          quit: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
          disconnect: jest.fn().mockImplementation(function (this: { status: string }) {
            this.status = 'end';
          }),
        };

        const module = new RedisModule(mockRedis as unknown as Redis);
        await module.onModuleDestroy();

        expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
        expect(mockRedis.status).toBe('end');
      });

      it('en estado end simulado (ya desconectado), quit() rechaza y disconnect() permanece idempotente', async () => {
        const mockRedis = {
          status: 'end',
          quit: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
          disconnect: jest.fn(),
        };

        const module = new RedisModule(mockRedis as unknown as Redis);
        await module.onModuleDestroy();

        expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
        expect(mockRedis.status).toBe('end');
      });
    });
  });
});
