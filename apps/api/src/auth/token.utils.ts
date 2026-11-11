import { createHash, randomBytes } from 'node:crypto';

/**
 * Longitud en bytes de la entropía criptográfica para el refresh token (256 bits).
 */
export const REFRESH_TOKEN_BYTE_LENGTH = 32;

/**
 * Longitud esperada del refresh token codificado en base64url (sin relleno '=').
 * 32 bytes de entropía codificados en base64url resultan exactamente en 43 caracteres.
 */
export const REFRESH_TOKEN_BASE64URL_LENGTH = 43;

/**
 * Expresión regular para validar el formato base64url de un refresh token generado (43 caracteres).
 * Conjunto de caracteres: A-Z, a-z, 0-9, '-', '_'
 */
export const REFRESH_TOKEN_BASE64URL_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Longitud esperada del hash SHA-256 en representación hexadecimal.
 */
export const REFRESH_TOKEN_HASH_HEX_LENGTH = 64;

/**
 * Expresión regular para validar el formato hexadecimal del hash SHA-256 (64 caracteres en minúscula).
 */
export const REFRESH_TOKEN_HASH_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Genera un refresh token criptográficamente seguro de 256 bits (32 bytes)
 * codificado en formato base64url sin caracteres de relleno ('=').
 *
 * @returns Token opaco de 43 caracteres base64url con 256 bits de entropía.
 */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTE_LENGTH).toString('base64url');
}

/**
 * Calcula el hash criptográfico SHA-256 de un refresh token con salida en formato hexadecimal.
 *
 * Este hash se almacena en la base de datos (columna `token_hash` del modelo `Session`)
 * y se utiliza para la indexación y búsqueda en tiempo constante O(1) de sesiones activas.
 *
 * Nota de seguridad:
 * Bajo ninguna circunstancia se debe registrar ni persistir el token en texto plano.
 *
 * @param token Token de refresco en texto plano.
 * @returns Hash SHA-256 en formato hexadecimal de 64 caracteres en minúscula.
 * @throws Error si el token no es una cadena válida o está vacío/en blanco.
 */
export function hashRefreshToken(token: string): string {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('El token de refresco no puede estar vacío');
  }

  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constantes y utilidades para tokens de invitación (HU29).
 * Utilizan la misma entropía criptográfica de 256 bits y codificación base64url sin relleno.
 */
export const INVITATION_TOKEN_BYTE_LENGTH = REFRESH_TOKEN_BYTE_LENGTH;
export const INVITATION_TOKEN_BASE64URL_LENGTH = REFRESH_TOKEN_BASE64URL_LENGTH;
export const INVITATION_TOKEN_BASE64URL_REGEX = REFRESH_TOKEN_BASE64URL_REGEX;
export const INVITATION_TOKEN_HASH_HEX_LENGTH = REFRESH_TOKEN_HASH_HEX_LENGTH;
export const INVITATION_TOKEN_HASH_HEX_REGEX = REFRESH_TOKEN_HASH_HEX_REGEX;

/**
 * Genera un token de invitación criptográficamente seguro de 256 bits (32 bytes)
 * codificado en base64url (43 caracteres).
 */
export function generateInvitationToken(): string {
  return generateRefreshToken();
}

/**
 * Calcula el hash SHA-256 en formato hexadecimal de un token de invitación.
 *
 * @param token Token de invitación en texto plano.
 * @returns Hash SHA-256 de 64 caracteres en minúscula.
 */
export function hashInvitationToken(token: string): string {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('El token de invitación no puede estar vacío');
  }

  return createHash('sha256').update(token).digest('hex');
}
