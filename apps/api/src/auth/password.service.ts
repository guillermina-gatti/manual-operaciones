import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

export const BCRYPT_SALT_ROUNDS = 10;

/**
 * Expresión regular para validar el formato de hashes bcrypt admitidos por la versión instalada (bcrypt 6.x):
 * - Prefijos admitidos por la implementación: $2a$ y $2b$ ($2x$ y $2y$ no son soportados por la biblioteca instalada).
 * - Rango de costo (log_rounds): 04 a 31 (el motor C++ de bcrypt descarta valores fuera de 4..31).
 * - Separador $: un carácter.
 * - Salt (22 caracteres) + checksum (31 caracteres) codificados en Radix-64 de bcrypt (./0-9A-Za-z): exactamente 53 caracteres.
 * Longitud total: 60 caracteres.
 */
export const BCRYPT_HASH_REGEX = /^\$2[ab]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

@Injectable()
export class PasswordService {
  private readonly saltRounds = BCRYPT_SALT_ROUNDS;

  /**
   * Genera el hash bcrypt de una contraseña en texto plano.
   * Lanza un Error si la contraseña no es una cadena válida o está vacía.
   */
  async hash(password: string): Promise<string> {
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('La contraseña no puede estar vacía');
    }
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Compara una contraseña en texto plano contra un hash bcrypt.
   *
   * 1. Validación previa de entradas (rechazo seguro):
   *    - Si la contraseña no es una cadena o está vacía, devuelve false de inmediato sin llamar a bcrypt.
   *    - Si el hash no es una cadena o no cumple con el formato estándar admitido por bcrypt,
   *      devuelve false de inmediato.
   *
   * 2. Comparación criptográfica:
   *    - Superada la validación de formato, se delega la verificación criptográfica a bcrypt.compare.
   *      El hecho de que el formato sea válido no garantiza que el hash coincida ni sea criptográficamente íntegro.
   *
   * 3. Manejo de errores:
   *    - Los errores inesperados en tiempo de ejecución (fallas de la biblioteca nativa, memoria, etc.)
   *      se propagan hacia arriba y no se enmascaran como false.
   */
  async compare(password: string, hash: string): Promise<boolean> {
    if (typeof password !== 'string' || password.length === 0) {
      return false;
    }

    if (typeof hash !== 'string' || !BCRYPT_HASH_REGEX.test(hash)) {
      return false;
    }

    return bcrypt.compare(password, hash);
  }
}
