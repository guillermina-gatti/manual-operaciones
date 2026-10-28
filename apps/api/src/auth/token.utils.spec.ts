import { createHash } from 'node:crypto';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_BASE64URL_LENGTH,
  REFRESH_TOKEN_BASE64URL_REGEX,
  REFRESH_TOKEN_BYTE_LENGTH,
  REFRESH_TOKEN_HASH_HEX_LENGTH,
  REFRESH_TOKEN_HASH_HEX_REGEX,
} from './token.utils';

describe('token.utils', () => {
  describe('Constantes y expresiones regulares', () => {
    it('debe definir la longitud de entropía en 32 bytes (256 bits)', () => {
      expect(REFRESH_TOKEN_BYTE_LENGTH).toBe(32);
    });

    it('debe definir la longitud base64url en 43 caracteres', () => {
      expect(REFRESH_TOKEN_BASE64URL_LENGTH).toBe(43);
    });

    it('debe definir la longitud del hash hexadecimal SHA-256 en 64 caracteres', () => {
      expect(REFRESH_TOKEN_HASH_HEX_LENGTH).toBe(64);
    });

    it('debe validar tokens base64url válidos y rechazar inválidos con REFRESH_TOKEN_BASE64URL_REGEX', () => {
      const valid = 'A'.repeat(43);
      const withHyphenAndUnderscore = `${'a'.repeat(21)}-_${'B'.repeat(20)}`;
      const withPadding = `${'A'.repeat(42)}=`;
      const withStandardBase64 = `${'A'.repeat(41)}+/`;
      const tooShort = 'A'.repeat(42);
      const tooLong = 'A'.repeat(44);

      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(valid)).toBe(true);
      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(withHyphenAndUnderscore)).toBe(true);
      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(withPadding)).toBe(false);
      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(withStandardBase64)).toBe(false);
      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(tooShort)).toBe(false);
      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(tooLong)).toBe(false);
    });

    it('debe validar hashes hexadecimales válidos y rechazar inválidos con REFRESH_TOKEN_HASH_HEX_REGEX', () => {
      const validLower = 'a'.repeat(64);
      const validDigits = '1234567890'.repeat(6) + '1234';
      const uppercase = 'A'.repeat(64);
      const nonHex = 'g'.repeat(64);
      const tooShort = 'a'.repeat(63);
      const tooLong = 'a'.repeat(65);

      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(validLower)).toBe(true);
      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(validDigits)).toBe(true);
      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(uppercase)).toBe(false);
      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(nonHex)).toBe(false);
      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(tooShort)).toBe(false);
      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(tooLong)).toBe(false);
    });
  });

  describe('generateRefreshToken()', () => {
    it('debe generar un token con longitud exacta de 43 caracteres', () => {
      const token = generateRefreshToken();

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(REFRESH_TOKEN_BASE64URL_LENGTH);
    });

    it('debe generar un token que cumple con el conjunto de caracteres base64url sin relleno', () => {
      const token = generateRefreshToken();

      expect(REFRESH_TOKEN_BASE64URL_REGEX.test(token)).toBe(true);
      expect(token).not.toContain('=');
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
    });

    it('debe producir valores distintos en llamadas sucesivas (comprobación práctica de muestreo)', () => {
      // Comprobación práctica de variabilidad y entropía entre muestras sucesivas.
      // No pretende constituir una demostración matemática de ausencia absoluta de colisiones.
      const sampleSize = 50;
      const generatedTokens = new Set<string>();

      for (let i = 0; i < sampleSize; i++) {
        generatedTokens.add(generateRefreshToken());
      }

      expect(generatedTokens.size).toBe(sampleSize);
    });
  });

  describe('hashRefreshToken()', () => {
    it('debe generar un hash SHA-256 hexadecimal válido de 64 caracteres en minúscula', () => {
      const token = generateRefreshToken();
      const hash = hashRefreshToken(token);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(REFRESH_TOKEN_HASH_HEX_LENGTH);
      expect(REFRESH_TOKEN_HASH_HEX_REGEX.test(hash)).toBe(true);
    });

    it('debe ser determinista: producir exactamente el mismo hash para la misma entrada', () => {
      const token = generateRefreshToken();
      const hash1 = hashRefreshToken(token);
      const hash2 = hashRefreshToken(token);

      expect(hash1).toBe(hash2);
    });

    it('debe producir hashes distintos para tokens distintos', () => {
      const tokenA = generateRefreshToken();
      const tokenB = generateRefreshToken();

      const hashA = hashRefreshToken(tokenA);
      const hashB = hashRefreshToken(tokenB);

      expect(hashA).not.toBe(hashB);
    });

    it('debe coincidir con el cálculo estándar independiente de SHA-256', () => {
      const token = 'sample-test-refresh-token-for-verification';
      const expectedHash = createHash('sha256').update(token).digest('hex');

      const result = hashRefreshToken(token);

      expect(result).toBe(expectedHash);
    });

    it('debe rechazar una cadena vacía lanzando un Error descriptivo', () => {
      expect(() => hashRefreshToken('')).toThrow('El token de refresco no puede estar vacío');
    });

    it('debe rechazar cadenas compuestas únicamente por espacios o caracteres en blanco', () => {
      expect(() => hashRefreshToken('   ')).toThrow('El token de refresco no puede estar vacío');
      expect(() => hashRefreshToken('\t\n ')).toThrow('El token de refresco no puede estar vacío');
    });

    it('debe rechazar valores no string (null, undefined, números, objetos)', () => {
      expect(() => hashRefreshToken(null as unknown as string)).toThrow(
        'El token de refresco no puede estar vacío',
      );
      expect(() => hashRefreshToken(undefined as unknown as string)).toThrow(
        'El token de refresco no puede estar vacío',
      );
      expect(() => hashRefreshToken(12345 as unknown as string)).toThrow(
        'El token de refresco no puede estar vacío',
      );
      expect(() => hashRefreshToken({} as unknown as string)).toThrow(
        'El token de refresco no puede estar vacío',
      );
    });
  });
});
