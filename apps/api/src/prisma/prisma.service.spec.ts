import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalEnvUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalEnvUrl !== undefined) {
      process.env.DATABASE_URL = originalEnvUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  describe('inicialización y configuración', () => {
    it('debe inicializarse correctamente usando DATABASE_URL provista por ConfigService', () => {
      const getSpy = jest
        .fn()
        .mockReturnValue('postgresql://user:pass@localhost:5432/db');
      const mockConfigService = {
        get: getSpy,
      } as unknown as ConfigService;

      const service = new PrismaService(mockConfigService);

      expect(getSpy).toHaveBeenCalledWith('DATABASE_URL');
      expect(service).toBeDefined();
    });

    it('debe utilizar process.env.DATABASE_URL como fallback si no se pasa ConfigService', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/fallback_db';

      const service = new PrismaService();

      expect(service).toBeDefined();
    });

    it('debe lanzar un error si DATABASE_URL no está configurada', () => {
      delete process.env.DATABASE_URL;
      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new PrismaService(mockConfigService)).toThrow(
        'DATABASE_URL no está configurada',
      );
    });

    it('debe resolver PrismaService dentro de un módulo de NestJS con ConfigService', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          PrismaService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('postgresql://localhost:5432/test_db'),
            },
          },
        ],
      }).compile();

      const service = moduleRef.get<PrismaService>(PrismaService);

      expect(service).toBeDefined();
      expect(service.constructor.name).toBe('PrismaService');
    });
  });

  describe('ciclo de vida', () => {
    let service: PrismaService;

    beforeEach(() => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue('postgresql://user:pass@localhost:5432/db'),
      } as unknown as ConfigService;
      service = new PrismaService(mockConfigService);
    });

    it('debe llamar a $connect al inicializar el módulo (onModuleInit)', async () => {
      const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('debe llamar a $disconnect al destruir el módulo (onModuleDestroy)', async () => {
      const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
