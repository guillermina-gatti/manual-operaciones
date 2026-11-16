const VALID_DEV_URL =
  'postgresql://dev_user:dev_secret@localhost:5432/manual';
const VALID_TEST_URL =
  'postgresql://test_user:test_secret@localhost:5432/manual_test';
const VALID_E2E_URL =
  'postgresql://e2e_user:e2e_secret@localhost:5432/manual_e2e_test';

const mockDotenvConfig = jest.fn<unknown, unknown[]>();
const mockExistsSync = jest.fn<boolean, unknown[]>(() => true);
const mockReadFileSync = jest.fn<string, unknown[]>(
  () => `DATABASE_URL=${VALID_DEV_URL}\nTEST_DATABASE_URL=${VALID_TEST_URL}\n`,
);

jest.mock('dotenv', () => {
  const actual = jest.requireActual<typeof import('dotenv')>('dotenv');
  return {
    ...actual,
    config: (...args: Parameters<typeof actual.config>) =>
      mockDotenvConfig(...args),
  };
});

jest.mock('node:fs', () => {
  const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) =>
      mockExistsSync(...args),
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
      mockReadFileSync(...args),
  };
});

import {
  E2E_DATABASE_NAME,
  TEST_REDIS_KEY_PREFIX,
  assertE2eDatabaseConnected,
  assertLocalE2eDatabase,
  assertLocalTestDatabase,
  getTestBullMqConnection,
  useE2eDatabase,
  useTestDatabase,
} from './test-database';

describe('Aislamiento de base de datos E2E (HU30.M4.1-C)', () => {
  const savedEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  };

  function restoreEnv(): void {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  }

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    delete process.env.E2E_DATABASE_URL;
    mockDotenvConfig.mockClear();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      `DATABASE_URL=${VALID_DEV_URL}\nTEST_DATABASE_URL=${VALID_TEST_URL}\n`,
    );
  });

  afterAll(() => {
    restoreEnv();
  });

  describe('A. useE2eDatabase()', () => {
    it('acepta una E2E_DATABASE_URL válida y la asigna a DATABASE_URL', () => {
      process.env.E2E_DATABASE_URL = VALID_E2E_URL;

      const resolved = useE2eDatabase();

      expect(resolved).toBe(VALID_E2E_URL);
      expect(process.env.DATABASE_URL).toBe(VALID_E2E_URL);
    });

    it('rechaza E2E_DATABASE_URL ausente sin usar fallback', () => {
      expect(() => useE2eDatabase()).toThrow(/Falta E2E_DATABASE_URL/);
    });

    it.each(['', '   '])('rechaza E2E_DATABASE_URL vacía (%j)', (value) => {
      process.env.E2E_DATABASE_URL = value;

      expect(() => useE2eDatabase()).toThrow(/Falta E2E_DATABASE_URL/);
    });

    it('no utiliza TEST_DATABASE_URL como fallback', () => {
      process.env.TEST_DATABASE_URL = VALID_TEST_URL;

      expect(() => useE2eDatabase()).toThrow(/Falta E2E_DATABASE_URL/);
      expect(process.env.DATABASE_URL).toBeUndefined();
    });

    it('no utiliza DATABASE_URL como fallback', () => {
      process.env.DATABASE_URL = VALID_DEV_URL;

      expect(() => useE2eDatabase()).toThrow(/Falta E2E_DATABASE_URL/);
      expect(process.env.DATABASE_URL).toBe(VALID_DEV_URL);
    });

    it('rechaza que E2E_DATABASE_URL coincida con DATABASE_URL de .env', () => {
      process.env.E2E_DATABASE_URL = VALID_E2E_URL;
      mockReadFileSync.mockReturnValue(
        `DATABASE_URL=${VALID_E2E_URL}\nTEST_DATABASE_URL=${VALID_TEST_URL}\n`,
      );

      expect(() => useE2eDatabase()).toThrow(
        /E2E_DATABASE_URL es igual a DATABASE_URL de desarrollo/,
      );
    });

    it('rechaza que E2E_DATABASE_URL coincida con TEST_DATABASE_URL de .env', () => {
      process.env.E2E_DATABASE_URL = VALID_E2E_URL;
      mockReadFileSync.mockReturnValue(
        `DATABASE_URL=${VALID_DEV_URL}\nTEST_DATABASE_URL=${VALID_E2E_URL}\n`,
      );

      expect(() => useE2eDatabase()).toThrow(
        /E2E_DATABASE_URL es igual a TEST_DATABASE_URL/,
      );
    });
  });

  describe('B. assertLocalE2eDatabase()', () => {
    it.each([
      'postgresql://app:app@localhost:5432/manual_e2e_test',
      'postgresql://app:app@127.0.0.1:5432/manual_e2e_test',
    ])('acepta host local válido (%s)', (url) => {
      expect(() => assertLocalE2eDatabase(url, 'prueba E2E')).not.toThrow();
    });

    it.each([
      [
        'base manual',
        'postgresql://mi_usuario:super_secreto@localhost:5432/manual?sslmode=require',
      ],
      [
        'base manual_test',
        'postgresql://mi_usuario:super_secreto@localhost:5432/manual_test?sslmode=require',
      ],
      [
        'otro nombre de base',
        'postgresql://mi_usuario:super_secreto@localhost:5432/otra_base_test?sslmode=require',
      ],
      [
        'base manual_e2e sin sufijo _test',
        'postgresql://mi_usuario:super_secreto@localhost:5432/manual_e2e?sslmode=require',
      ],
      [
        'host remoto',
        'postgresql://mi_usuario:super_secreto@rds.ejemplo.internal:5432/manual_e2e_test?sslmode=require',
      ],
    ])(
      'rechaza %s sin exponer credenciales ni parámetros sensibles',
      (_label, url) => {
        let caught: unknown;
        try {
          assertLocalE2eDatabase(url, 'prueba E2E');
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(Error);
        const message = (caught as Error).message;
        expect(message).toContain(E2E_DATABASE_NAME);
        expect(message).not.toContain('mi_usuario');
        expect(message).not.toContain('super_secreto');
        expect(message).not.toContain('sslmode=require');
      },
    );

    it('rechaza URLs inválidas sin exponer la cadena original', () => {
      expect(() =>
        assertLocalE2eDatabase(
          'postgresql://u:secreto@:puerto_invalido',
          'prueba E2E',
        ),
      ).toThrow(/E2E_DATABASE_URL no tiene un formato de URL válido/);
    });
  });

  describe('C. assertE2eDatabaseConnected()', () => {
    function createPrismaMock(queryMock: jest.Mock) {
      return {
        $queryRawUnsafe: queryMock,
      } as unknown as Parameters<typeof assertE2eDatabaseConnected>[0];
    }

    it('acepta una conexión cuya base actual es exactamente manual_e2e_test', async () => {
      process.env.E2E_DATABASE_URL = VALID_E2E_URL;
      process.env.DATABASE_URL = VALID_E2E_URL;
      const queryMock = jest
        .fn()
        .mockResolvedValue([{ current_database: 'manual_e2e_test' }]);

      await expect(
        assertE2eDatabaseConnected(createPrismaMock(queryMock)),
      ).resolves.toBeUndefined();
      expect(queryMock).toHaveBeenCalledWith('SELECT current_database()');
    });

    it.each(['manual', 'manual_test', 'otra_test', ''])(
      'rechaza current_database()=%j',
      async (reportedDb) => {
        process.env.E2E_DATABASE_URL = VALID_E2E_URL;
        process.env.DATABASE_URL = VALID_E2E_URL;
        const queryMock = jest
          .fn()
          .mockResolvedValue([{ current_database: reportedDb }]);

        await expect(
          assertE2eDatabaseConnected(createPrismaMock(queryMock)),
        ).rejects.toThrow(/se esperaba "manual_e2e_test"/);
      },
    );

    it('rechaza discrepancias entre DATABASE_URL y E2E_DATABASE_URL', async () => {
      process.env.E2E_DATABASE_URL = VALID_E2E_URL;
      process.env.DATABASE_URL = VALID_TEST_URL;
      const queryMock = jest.fn();

      await expect(
        assertE2eDatabaseConnected(createPrismaMock(queryMock)),
      ).rejects.toThrow(/DATABASE_URL no coincide con E2E_DATABASE_URL/);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('rechaza si falta DATABASE_URL', async () => {
      process.env.E2E_DATABASE_URL = VALID_E2E_URL;
      const queryMock = jest.fn();

      await expect(
        assertE2eDatabaseConnected(createPrismaMock(queryMock)),
      ).rejects.toThrow(/DATABASE_URL no está configurada/);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  describe('D. Compatibilidad con configuración anterior (manual_test)', () => {
    it('useTestDatabase() mantiene su comportamiento basado en TEST_DATABASE_URL', () => {
      process.env.TEST_DATABASE_URL = VALID_TEST_URL;

      const resolved = useTestDatabase();

      expect(resolved).toBe(VALID_TEST_URL);
      expect(process.env.DATABASE_URL).toBe(VALID_TEST_URL);
    });

    it('assertLocalTestDatabase() sigue aceptando manual_test y rechazando manual', () => {
      expect(() =>
        assertLocalTestDatabase(VALID_TEST_URL, 'seed:fixtures'),
      ).not.toThrow();
      expect(() =>
        assertLocalTestDatabase(VALID_DEV_URL, 'seed:fixtures'),
      ).toThrow(/manual/);
    });
  });

  describe('E. Aislamiento de Redis E2E para BullMQ (getTestBullMqConnection)', () => {
    const savedRedisEnv = {
      TEST_REDIS_URL: process.env.TEST_REDIS_URL,
      TEST_REDIS_HOST: process.env.TEST_REDIS_HOST,
      TEST_REDIS_PORT: process.env.TEST_REDIS_PORT,
      REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
    };

    afterEach(() => {
      for (const [key, val] of Object.entries(savedRedisEnv)) {
        if (val === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = val;
        }
      }
    });

    it('deriva host, puerto, db y prefijo test:e2e: desde TEST_REDIS_URL e ignora TEST_REDIS_HOST/PORT', () => {
      process.env.TEST_REDIS_URL = 'redis://127.0.0.1:6380/2';
      process.env.TEST_REDIS_HOST = 'localhost';
      process.env.TEST_REDIS_PORT = '6379';

      const res = getTestBullMqConnection();

      expect(res.url).toBe('redis://127.0.0.1:6380/2');
      expect(res.keyPrefix).toBe(TEST_REDIS_KEY_PREFIX);
      expect(res.connection).toMatchObject({
        host: '127.0.0.1',
        port: 6380,
        db: 2,
      });
      expect(process.env.REDIS_KEY_PREFIX).toBe(TEST_REDIS_KEY_PREFIX);
    });

    it('falla explícitamente si falta TEST_REDIS_URL sin caer en DB 0', () => {
      delete process.env.TEST_REDIS_URL;
      process.env.TEST_REDIS_HOST = 'localhost';
      process.env.TEST_REDIS_PORT = '6379';

      expect(() => getTestBullMqConnection()).toThrow(/Falta TEST_REDIS_URL/);
    });

    it('rechaza TEST_REDIS_URL apuntando a localhost:6379 (DB 0) o formato inválido', () => {
      process.env.TEST_REDIS_URL = 'redis://localhost:6379/0';
      expect(() => getTestBullMqConnection()).toThrow(/DB 0/);

      process.env.TEST_REDIS_URL = 'http://localhost:6379/1';
      expect(() => getTestBullMqConnection()).toThrow(/protocolo no admitido/);
    });
  });
});
