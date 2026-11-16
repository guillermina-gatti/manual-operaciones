import { BCRYPT_HASH_REGEX, PasswordService } from '../auth/password.service';
import { Prisma } from '../generated/prisma/client';
import {
  assertInteractiveEnvironment,
  BootstrapAdminError,
  bootstrapInitialAdmin,
  MAX_SERIALIZATION_RETRIES,
  validateBootstrapInput,
} from './bootstrap-admin';

function makePrismaMock() {
  const userCount = jest.fn<Promise<number>, []>().mockResolvedValue(0);
  const userFindUnique = jest.fn<Promise<unknown>, []>().mockResolvedValue(null);
  const userCreate = jest.fn<
    Promise<Record<string, unknown>>,
    [{ data: Record<string, unknown> }]
  >(async (args: { data: Record<string, unknown> }) => ({
    id: '00000000-0000-4000-8000-000000000001',
    email: args.data.email,
    name: args.data.name,
    role: args.data.role,
    isActive: args.data.isActive,
  }));

  const areaCreate = jest.fn();
  const userAreaCreateMany = jest.fn();

  const tx = {
    user: {
      count: userCount,
      findUnique: userFindUnique,
      create: userCreate,
    },
    area: {
      create: areaCreate,
    },
    userArea: {
      createMany: userAreaCreateMany,
    },
  };

  const $transaction = jest.fn<
    Promise<unknown>,
    [(client: typeof tx) => Promise<unknown>, unknown?]
  >(async (callback, _options) => callback(tx));

  return {
    prisma: { $transaction } as unknown as Parameters<typeof bootstrapInitialAdmin>[0],
    $transaction,
    tx,
    userCount,
    userFindUnique,
    userCreate,
    areaCreate,
    userAreaCreateMany,
  };
}

describe('bootstrap-admin (M3.1)', () => {
  const validInput = {
    email: '  Admin.Inicial@Empresa.COM  ',
    name: '  Camila Administradora  ',
    password: 'ClaveSegura2026!',
    confirmPassword: 'ClaveSegura2026!',
  };

  describe('assertInteractiveEnvironment', () => {
    it('exige process.stdin.isTTY === true', () => {
      expect(() =>
        assertInteractiveEnvironment(['node', 'bootstrap-admin.js'], {
          isTTY: false,
        }),
      ).toThrow(BootstrapAdminError);

      expect(() =>
        assertInteractiveEnvironment(
          ['node', 'bootstrap-admin.js'],
          {} as Pick<NodeJS.ReadStream, 'isTTY'>,
        ),
      ).toThrow(/terminal interactiva/i);
    });

    it('rechaza argumentos CLI para evitar exposición de credenciales', () => {
      expect(() =>
        assertInteractiveEnvironment(
          ['node', 'bootstrap-admin.js', '--password=secreto'],
          { isTTY: true },
        ),
      ).toThrow(/no acepta credenciales/i);
    });

    it('permite ejecución interactiva sin argumentos cuando isTTY es true', () => {
      expect(() =>
        assertInteractiveEnvironment(['node', 'bootstrap-admin.js'], {
          isTTY: true,
        }),
      ).not.toThrow();
    });
  });

  describe('validateBootstrapInput', () => {
    it('normaliza email con trim y toLowerCase, y aplica trim al nombre', () => {
      const validated = validateBootstrapInput(validInput);
      expect(validated).toEqual({
        email: 'admin.inicial@empresa.com',
        name: 'Camila Administradora',
        password: 'ClaveSegura2026!',
      });
    });

    it('rechaza emails inválidos', () => {
      expect(() =>
        validateBootstrapInput({ ...validInput, email: 'sin-arroba' }),
      ).toThrow(/correo electrónico/i);
      expect(() =>
        validateBootstrapInput({ ...validInput, email: '   ' }),
      ).toThrow(/correo electrónico/i);
    });

    it('rechaza nombres menores a 2 o mayores a 100 caracteres', () => {
      expect(() =>
        validateBootstrapInput({ ...validInput, name: ' A ' }),
      ).toThrow(/nombre debe tener entre 2 y 100/i);
      expect(() =>
        validateBootstrapInput({ ...validInput, name: 'A'.repeat(101) }),
      ).toThrow(/nombre debe tener entre 2 y 100/i);
    });

    it('respeta cotas HU29 de contraseña (8..128 caracteres) y confirmación', () => {
      expect(() =>
        validateBootstrapInput({
          ...validInput,
          password: 'corta',
          confirmPassword: 'corta',
        }),
      ).toThrow(/al menos 8 caracteres/i);

      expect(() =>
        validateBootstrapInput({
          ...validInput,
          password: 'X'.repeat(129),
          confirmPassword: 'X'.repeat(129),
        }),
      ).toThrow(/128 caracteres/i);

      expect(() =>
        validateBootstrapInput({
          ...validInput,
          confirmPassword: 'OtraClaveDistinta2026!',
        }),
      ).toThrow(/no coinciden/i);
    });
  });

  describe('bootstrapInitialAdmin', () => {
    it('crea el primer ADMIN con hash bcrypt válido (cost 10), transacción Serializable y sin áreas', async () => {
      const { prisma, $transaction, userCreate, areaCreate, userAreaCreateMany } =
        makePrismaMock();
      const passwordService = new PasswordService();
      const hashSpy = jest.spyOn(passwordService, 'hash');

      const result = await bootstrapInitialAdmin(
        prisma,
        passwordService,
        validInput,
      );

      expect(hashSpy).toHaveBeenCalledTimes(1);
      expect(hashSpy).toHaveBeenCalledWith('ClaveSegura2026!');

      expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      const createArgs = userCreate.mock.calls[0]?.[0];
      expect(createArgs?.data.email).toBe('admin.inicial@empresa.com');
      expect(createArgs?.data.name).toBe('Camila Administradora');
      expect(createArgs?.data.role).toBe('ADMIN');
      expect(createArgs?.data.isActive).toBe(true);
      expect(typeof createArgs?.data.passwordHash).toBe('string');
      expect(createArgs?.data.passwordHash).toMatch(BCRYPT_HASH_REGEX);
      await expect(
        passwordService.compare(
          'ClaveSegura2026!',
          String(createArgs?.data.passwordHash),
        ),
      ).resolves.toBe(true);

      // El resumen devuelto no expone passwordHash ni contraseña
      expect(result).toEqual({
        id: '00000000-0000-4000-8000-000000000001',
        email: 'admin.inicial@empresa.com',
        name: 'Camila Administradora',
        role: 'ADMIN',
        isActive: true,
      });
      expect(JSON.stringify(result)).not.toContain('ClaveSegura2026!');
      expect(JSON.stringify(result)).not.toContain('passwordHash');

      // No se crean áreas ni user_areas
      expect(areaCreate).not.toHaveBeenCalled();
      expect(userAreaCreateMany).not.toHaveBeenCalled();
    });

    it('calcula el hash bcrypt antes de abrir la transacción', async () => {
      const { prisma, $transaction } = makePrismaMock();
      const order: string[] = [];
      const passwordService = {
        hash: jest.fn(async () => {
          order.push('hash');
          return '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
        }),
      };
      $transaction.mockImplementationOnce(async (cb, _opts) => {
        order.push('transaction');
        return cb(makePrismaMock().tx);
      });

      await bootstrapInitialAdmin(prisma, passwordService, validInput);
      expect(order).toEqual(['hash', 'transaction']);
    });

    it('aborta sin modificar registros si ya existe un usuario ADMIN', async () => {
      const { prisma, userCount, userCreate } = makePrismaMock();
      userCount.mockResolvedValueOnce(1);
      const passwordService = new PasswordService();

      await expect(
        bootstrapInitialAdmin(prisma, passwordService, validInput),
      ).rejects.toThrow(/ya existe al menos un usuario administrador/i);

      expect(userCreate).not.toHaveBeenCalled();
    });

    it('reintenta ante P2034 repitiendo la transacción sin recalcular hash', async () => {
      const { prisma, $transaction, tx, userCount } = makePrismaMock();
      const passwordService = {
        hash: jest.fn(
          async () =>
            '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
        ),
      };

      const p2034 = new Prisma.PrismaClientKnownRequestError(
        'Serialization failure',
        { code: 'P2034', clientVersion: '7.10.0' },
      );

      $transaction
        .mockRejectedValueOnce(p2034)
        .mockImplementationOnce(async (cb, _opts) => cb(tx));

      const result = await bootstrapInitialAdmin(
        prisma,
        passwordService,
        validInput,
      );

      expect(passwordService.hash).toHaveBeenCalledTimes(1);
      expect($transaction).toHaveBeenCalledTimes(2);
      expect(userCount).toHaveBeenCalledTimes(1);
      expect(result.role).toBe('ADMIN');
    });

    it('aborta tras agotar los reintentos por P2034 sin exponer credenciales', async () => {
      const { prisma, $transaction } = makePrismaMock();
      const passwordService = {
        hash: jest.fn(
          async () =>
            '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
        ),
      };
      const p2034 = new Prisma.PrismaClientKnownRequestError(
        'Serialization failure',
        { code: 'P2034', clientVersion: '7.10.0' },
      );
      $transaction.mockRejectedValue(p2034);

      await expect(
        bootstrapInitialAdmin(prisma, passwordService, validInput),
      ).rejects.toThrow(/concurrencia/i);

      expect($transaction).toHaveBeenCalledTimes(MAX_SERIALIZATION_RETRIES + 1);
    });

    it('aborta inmediatamente sin reintentar ante P2002 (email duplicado)', async () => {
      const { prisma, $transaction } = makePrismaMock();
      const passwordService = {
        hash: jest.fn(
          async () =>
            '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
        ),
      };
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on email',
        { code: 'P2002', clientVersion: '7.10.0' },
      );
      $transaction.mockRejectedValueOnce(p2002);

      await expect(
        bootstrapInitialAdmin(prisma, passwordService, validInput),
      ).rejects.toThrow(/correo electrónico ya se encuentra registrado/i);

      expect($transaction).toHaveBeenCalledTimes(1);
    });

    it('sanitiza errores inesperados de DB para no exponer DATABASE_URL ni credenciales', async () => {
      const { prisma, $transaction } = makePrismaMock();
      const passwordService = {
        hash: jest.fn(
          async () =>
            '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
        ),
      };
      $transaction.mockRejectedValueOnce(
        new Error('connect failed postgresql://user:SuperSecret@rds.internal:5432/db'),
      );

      let caught: Error | undefined;
      try {
        await bootstrapInitialAdmin(prisma, passwordService, validInput);
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).toBeInstanceOf(BootstrapAdminError);
      expect(caught?.message).not.toContain('SuperSecret');
      expect(caught?.message).not.toContain('postgresql://');
      expect(caught?.message).not.toContain('ClaveSegura2026!');
    });
  });
});
