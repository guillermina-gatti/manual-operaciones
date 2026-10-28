import bcrypt from 'bcrypt';
import {
  BCRYPT_HASH_REGEX,
  BCRYPT_SALT_ROUNDS,
  PasswordService,
} from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('BCRYPT_HASH_REGEX y constantes', () => {
    it('debe tener BCRYPT_SALT_ROUNDS configurado en 10', () => {
      expect(BCRYPT_SALT_ROUNDS).toBe(10);
    });

    it('debe validar sintácticamente hashes con prefijo $2a$ y $2b$ y rangos de costo 04 a 31', () => {
      const valid2b =
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const valid2a =
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const validMinCost =
        '$2b$04$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const validMaxCost =
        '$2b$31$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

      // Validación exclusivamente sintáctica por regex, sin ejecutar cómputo criptográfico
      expect(BCRYPT_HASH_REGEX.test(valid2b)).toBe(true);
      expect(BCRYPT_HASH_REGEX.test(valid2a)).toBe(true);
      expect(BCRYPT_HASH_REGEX.test(validMinCost)).toBe(true);
      expect(BCRYPT_HASH_REGEX.test(validMaxCost)).toBe(true);
    });

    it('debe rechazar prefijos o costos no soportados por la biblioteca bcrypt instalada', () => {
      const unsupported2x =
        '$2x$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const unsupported2y =
        '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const costBelowMin =
        '$2b$03$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const costAboveMax =
        '$2b$32$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

      expect(BCRYPT_HASH_REGEX.test(unsupported2x)).toBe(false);
      expect(BCRYPT_HASH_REGEX.test(unsupported2y)).toBe(false);
      expect(BCRYPT_HASH_REGEX.test(costBelowMin)).toBe(false);
      expect(BCRYPT_HASH_REGEX.test(costAboveMax)).toBe(false);
    });
  });

  describe('hash()', () => {
    it('debe generar un hash bcrypt válido con costo 10 y prefijo $2b$', async () => {
      const plain = 'P@ssword_Segura_2026!';
      const hash = await service.hash(plain);

      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$2b$10$')).toBe(true);
      expect(hash).toHaveLength(60);
      expect(BCRYPT_HASH_REGEX.test(hash)).toBe(true);
    });

    it('debe generar hashes distintos para la misma contraseña (sal única por ejecución)', async () => {
      const plain = 'MismaContraseña123';
      const hash1 = await service.hash(plain);
      const hash2 = await service.hash(plain);

      expect(hash1).not.toEqual(hash2);
      expect(await service.compare(plain, hash1)).toBe(true);
      expect(await service.compare(plain, hash2)).toBe(true);
    });

    it('debe lanzar un Error si la contraseña está vacía', async () => {
      await expect(service.hash('')).rejects.toThrow(
        'La contraseña no puede estar vacía',
      );
    });

    it('debe lanzar un Error si la contraseña no es de tipo string', async () => {
      await expect(service.hash(null as unknown as string)).rejects.toThrow(
        'La contraseña no puede estar vacía',
      );
      await expect(service.hash(undefined as unknown as string)).rejects.toThrow(
        'La contraseña no puede estar vacía',
      );
    });
  });

  describe('compare()', () => {
    const plainPassword = 'ClaveDeAccesoCorrecta#1';
    let validHash: string;

    beforeAll(async () => {
      const tempService = new PasswordService();
      validHash = await tempService.hash(plainPassword);
    });

    it('debe retornar true si la contraseña coincide con el hash válido', async () => {
      const result = await service.compare(plainPassword, validHash);
      expect(result).toBe(true);
    });

    it('debe retornar false si la contraseña no coincide con el hash válido', async () => {
      const result = await service.compare('ClaveIncorrecta', validHash);
      expect(result).toBe(false);
    });

    it('debe rechazar explícitamente contraseñas vacías devolviendo false sin llamar a bcrypt.compare', async () => {
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      const result = await service.compare('', validHash);

      expect(result).toBe(false);
      expect(compareSpy).not.toHaveBeenCalled();
    });

    it('debe rechazar contraseñas que no sean de tipo string devolviendo false sin llamar a bcrypt.compare', async () => {
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      expect(
        await service.compare(null as unknown as string, validHash),
      ).toBe(false);
      expect(
        await service.compare(undefined as unknown as string, validHash),
      ).toBe(false);
      expect(
        await service.compare(12345 as unknown as string, validHash),
      ).toBe(false);

      expect(compareSpy).not.toHaveBeenCalled();
    });

    it('debe rechazar hashes que no sean de tipo string devolviendo false sin llamar a bcrypt.compare', async () => {
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      expect(
        await service.compare(plainPassword, null as unknown as string),
      ).toBe(false);
      expect(
        await service.compare(plainPassword, undefined as unknown as string),
      ).toBe(false);
      expect(
        await service.compare(plainPassword, {} as unknown as string),
      ).toBe(false);

      expect(compareSpy).not.toHaveBeenCalled();
    });

    it('debe rechazar hashes malformados devolviendo false sin llamar a bcrypt.compare', async () => {
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      const malformedHashes = [
        '',
        'texto-plano-no-es-hash',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA-256
        '$2b$10$corto', // longitud inválida
        '$2x$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // prefijo 2x no soportado
        '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // prefijo 2y no soportado
        '$2b$03$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // costo fuera de rango (< 04)
        '$2b$32$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // costo fuera de rango (> 31)
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhW!', // caracter inválido (!)
      ];

      for (const hash of malformedHashes) {
        const result = await service.compare(plainPassword, hash);
        expect(result).toBe(false);
      }

      expect(compareSpy).not.toHaveBeenCalled();
    });

    it('debe mantener separada la validación de formato de la verificación criptográfica', async () => {
      // Un hash sintácticamente válido (costo estándar 10) que cumple la regex pero no corresponde a la contraseña probada
      const validFormatHash =
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      expect(BCRYPT_HASH_REGEX.test(validFormatHash)).toBe(true);

      const compareSpy = jest.spyOn(bcrypt, 'compare');
      const result = await service.compare(plainPassword, validFormatHash);

      // Debe llegar a la comparación criptográfica de bcrypt pero resultar false
      expect(compareSpy).toHaveBeenCalledWith(plainPassword, validFormatHash);
      expect(result).toBe(false);
    });

    it('debe propagar errores inesperados lanzados por bcrypt.compare sin convertirlos a false', async () => {
      const unexpectedError = new Error(
        'Fallo crítico en biblioteca nativa C++ / OpenSSL',
      );
      jest.spyOn(bcrypt, 'compare').mockRejectedValueOnce(unexpectedError);

      await expect(service.compare(plainPassword, validHash)).rejects.toThrow(
        'Fallo crítico en biblioteca nativa C++ / OpenSSL',
      );
    });
  });
});
