import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

export const ACCOUNT_IP_MAX_ATTEMPTS = 5;
export const GLOBAL_IP_MAX_ATTEMPTS = 50;
export const BLOCK_WINDOW_SECONDS = 900; // 15 minutos

export const REGISTRATION_IP_MAX_ATTEMPTS = 10;
export const REGISTRATION_TOKEN_MAX_ATTEMPTS = 5;
export const INVITATION_VALIDATION_IP_MAX_ATTEMPTS = 30;
export const REGISTRATION_BLOCK_WINDOW_SECONDS = 900; // 15 minutos

/**
 * Script Lua ejecutado en Redis para incrementar contadores de fallo y gestionar TTLs:
 * - Pre-valida argumentos y tipos de claves antes de mutar estado para prevenir errores de tipo a mitad de ejecución.
 * - Toma un snapshot previo de existencia, valor y TTL de ambas claves.
 * - Si alguna instrucción subsiguiente de EXPIRE falla, ejecuta una compensación manual (best-effort rollback):
 *   * Elimina claves que no existían previamente.
 *   * Restaura valor y persistencia/expiración en claves preexistentes.
 *   NOTA DE SEGURIDAD / LIMITACIÓN ARQUITECTÓNICA:
 *   Redis no provee transacciones ACID ni rollback automático a nivel motor. La restauración de TTL
 *   mediante EXPIRE es una aproximación de mejor esfuerzo (best-effort) y no garantiza una recuperación
 *   perfecta ante caídas de proceso, desconexión de red o errores de memoria OOM en Redis.
 *   En cualquier caso de error, el servicio aplica Fail-Closed arrojando HTTP 503, impidiendo
 *   que la autenticación continúe sin la protección activa del limitador.
 */
export const RECORD_FAILURE_LUA_SCRIPT = `
local accKey = KEYS[1]
local ipKey = KEYS[2]
local ttl = tonumber(ARGV[1])

if not accKey or not ipKey or not ttl or ttl <= 0 then
  return redis.error_reply("ERR_INVALID_ARGS")
end

local tAcc = redis.call('TYPE', accKey).ok
if tAcc ~= 'none' and tAcc ~= 'string' then
  return redis.error_reply("ERR_INVALID_KEY_TYPE_ACC")
end

local tIp = redis.call('TYPE', ipKey).ok
if tIp ~= 'none' and tIp ~= 'string' then
  return redis.error_reply("ERR_INVALID_KEY_TYPE_IP")
end

local existsAcc = redis.call('EXISTS', accKey)
local prevAccVal = existsAcc == 1 and redis.call('GET', accKey) or nil
local prevAccTtl = existsAcc == 1 and redis.call('TTL', accKey) or -2

local existsIp = redis.call('EXISTS', ipKey)
local prevIpVal = existsIp == 1 and redis.call('GET', ipKey) or nil
local prevIpTtl = existsIp == 1 and redis.call('TTL', ipKey) or -2

local function rollback()
  if existsAcc == 0 then
    redis.call('DEL', accKey)
  else
    redis.call('SET', accKey, prevAccVal)
    if prevAccTtl > 0 then
      redis.call('EXPIRE', accKey, prevAccTtl)
    elseif prevAccTtl == -1 then
      redis.call('PERSIST', accKey)
    end
  end

  if existsIp == 0 then
    redis.call('DEL', ipKey)
  else
    redis.call('SET', ipKey, prevIpVal)
    if prevIpTtl > 0 then
      redis.call('EXPIRE', ipKey, prevIpTtl)
    elseif prevIpTtl == -1 then
      redis.call('PERSIST', ipKey)
    end
  end
end

local curAcc = redis.call('INCR', accKey)
if curAcc == 1 then
  local ok = redis.call('EXPIRE', accKey, ttl)
  if ok ~= 1 then
    rollback()
    return redis.error_reply("ERR_FAILED_EXPIRE_ACC")
  end
elseif prevAccTtl == -1 then
  local ok = redis.call('EXPIRE', accKey, ttl)
  if ok ~= 1 then
    rollback()
    return redis.error_reply("ERR_FAILED_EXPIRE_ACC")
  end
end

local curIp = redis.call('INCR', ipKey)
if curIp == 1 then
  local ok = redis.call('EXPIRE', ipKey, ttl)
  if ok ~= 1 then
    rollback()
    return redis.error_reply("ERR_FAILED_EXPIRE_IP")
  end
elseif prevIpTtl == -1 then
  local ok = redis.call('EXPIRE', ipKey, ttl)
  if ok ~= 1 then
    rollback()
    return redis.error_reply("ERR_FAILED_EXPIRE_IP")
  end
end

return { curAcc, curIp }
`;

/**
 * Script Lua para registrar fallos en una única clave atómica con TTL.
 */
export const RECORD_SINGLE_FAILURE_LUA_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])

if not key or not ttl or ttl <= 0 then
  return redis.error_reply("ERR_INVALID_ARGS")
end

local t = redis.call('TYPE', key).ok
if t ~= 'none' and t ~= 'string' then
  return redis.error_reply("ERR_INVALID_KEY_TYPE")
end

local exists = redis.call('EXISTS', key)
local prevVal = exists == 1 and redis.call('GET', key) or nil
local prevTtl = exists == 1 and redis.call('TTL', key) or -2

local cur = redis.call('INCR', key)
if cur == 1 then
  local ok = redis.call('EXPIRE', key, ttl)
  if ok ~= 1 then
    redis.call('DEL', key)
    return redis.error_reply("ERR_FAILED_EXPIRE")
  end
elseif prevTtl == -1 then
  local ok = redis.call('EXPIRE', key, ttl)
  if ok ~= 1 then
    if exists == 0 then
      redis.call('DEL', key)
    else
      redis.call('SET', key, prevVal)
      redis.call('PERSIST', key)
    end
    return redis.error_reply("ERR_FAILED_EXPIRE")
  end
end

return cur
`;

@Injectable()
export class AuthRateLimiterService {
  private readonly logger = new Logger(AuthRateLimiterService.name);
  readonly accountIpMaxAttempts = ACCOUNT_IP_MAX_ATTEMPTS;
  readonly globalIpMaxAttempts = GLOBAL_IP_MAX_ATTEMPTS;
  readonly blockWindowSeconds = BLOCK_WINDOW_SECONDS;

  readonly registrationIpMaxAttempts = REGISTRATION_IP_MAX_ATTEMPTS;
  readonly registrationTokenMaxAttempts = REGISTRATION_TOKEN_MAX_ATTEMPTS;
  readonly invitationValidationIpMaxAttempts = INVITATION_VALIDATION_IP_MAX_ATTEMPTS;
  readonly registrationBlockWindowSeconds = REGISTRATION_BLOCK_WINDOW_SECONDS;

  private static readonly SAFE_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'NR_CLOSED',
    'CONNECTION_BROKEN',
    'UNCERTAIN_STATE',
  ]);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Normaliza canónicamente el correo y calcula su hash SHA-256 irreversible.
   * Evita registrar o almacenar correos electrónicos en texto plano en Redis.
   */
  hashEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    return createHash('sha256').update(normalized).digest('hex');
  }

  getAccountIpKey(email: string, ip: string): string {
    return `rl:auth:acc_ip:${this.hashEmail(email)}:${ip.trim()}`;
  }

  getGlobalIpKey(ip: string): string {
    return `rl:auth:ip:${ip.trim()}`;
  }

  /**
   * Normaliza canónicamente el token y calcula su hash SHA-256 irreversible.
   * Evita registrar o almacenar tokens de invitación en texto plano en Redis.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
  }

  getRegistrationIpKey(ip: string): string {
    return `rl:auth:reg_ip:${ip.trim()}`;
  }

  getRegistrationTokenKey(token: string): string {
    return `rl:auth:reg_tok:${this.hashToken(token)}`;
  }

  getInvitationValidationIpKey(ip: string): string {
    return `rl:auth:val_ip:${ip.trim()}`;
  }

  /**
   * Verifica si la petición de inicio de sesión tiene permitido continuar.
   *
   * Reglas:
   * 1. Si cuenta+IP tiene >= 5 intentos fallidos, bloquea con HTTP 429 (ACCOUNT_IP).
   * 2. Si la IP global tiene >= 50 intentos fallidos, bloquea con HTTP 429 (GLOBAL_IP).
   * 3. Ante contadores inconsistentes, desconexión, timeout o fallo de Redis, aplica Fail-Closed (HTTP 503).
   */
  async assertAllowed(email: string, ip: string): Promise<void> {
    this.validateInputs(email, ip);

    const accKey = this.getAccountIpKey(email, ip);
    const ipKey = this.getGlobalIpKey(ip);

    try {
      const [accCountStr, ipCountStr] = await this.redis.mget(accKey, ipKey);
      const accCount = this.parseCounter(accCountStr);
      const ipCount = this.parseCounter(ipCountStr);

      // 1. Verificación primaria: Cuenta + IP (umbral 5)
      if (accCount >= this.accountIpMaxAttempts) {
        let ttl = await this.redis.ttl(accKey);
        if (ttl <= 0) ttl = this.blockWindowSeconds;

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `Demasiados intentos fallidos para esta cuenta. Intente nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
            retryAfter: ttl,
            limitType: 'ACCOUNT_IP',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 2. Verificación secundaria: IP Global (umbral 50)
      if (ipCount >= this.globalIpMaxAttempts) {
        let ttl = await this.redis.ttl(ipKey);
        if (ttl <= 0) ttl = this.blockWindowSeconds;

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `Demasiados intentos fallidos desde esta dirección IP. Intente nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
            retryAfter: ttl,
            limitType: 'GLOBAL_IP',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.handleRedisError(error, 'assertAllowed');
    }
  }

  /**
   * Registra un intento fallido incrementando atómicamente cuenta+IP e IP global con TTL de 15 min.
   * Si Redis falla, aplica fail-closed lanzando HTTP 503.
   */
  async recordFailure(email: string, ip: string): Promise<void> {
    this.validateInputs(email, ip);

    const accKey = this.getAccountIpKey(email, ip);
    const ipKey = this.getGlobalIpKey(ip);

    try {
      await this.redis.eval(
        RECORD_FAILURE_LUA_SCRIPT,
        2,
        accKey,
        ipKey,
        this.blockWindowSeconds.toString(),
      );
    } catch (error) {
      this.handleRedisError(error, 'recordFailure');
    }
  }

  /**
   * Restablecimiento asimétrico tras login exitoso:
   * - Elimina únicamente la clave de cuenta+IP.
   * - El contador global de la IP se preserva intacto.
   */
  async reset(email: string, ip: string): Promise<void> {
    this.validateInputs(email, ip);

    const accKey = this.getAccountIpKey(email, ip);

    try {
      await this.redis.del(accKey);
    } catch (error) {
      this.handleRedisError(error, 'reset');
    }
  }

  /**
   * Verifica si la petición de registro público por invitación tiene permitido continuar.
   *
   * Reglas:
   * 1. Si el token específico tiene >= 5 intentos fallidos, bloquea con HTTP 429 (INVITATION_TOKEN).
   * 2. Si la IP tiene >= 10 intentos fallidos de registro, bloquea con HTTP 429 (REGISTRATION_IP).
   * 3. Ante falla o desconexión de Redis, aplica Fail-Closed arrojando HTTP 503.
   */
  async assertRegistrationAllowed(ip: string, token?: string): Promise<void> {
    this.validateIp(ip);
    if (token !== undefined && (typeof token !== 'string' || token.trim().length === 0)) {
      throw new BadRequestException('Token inválido para control de tasa');
    }

    const ipKey = this.getRegistrationIpKey(ip);
    const tokenKey = token ? this.getRegistrationTokenKey(token) : null;

    try {
      if (tokenKey) {
        const [ipCountStr, tokenCountStr] = await this.redis.mget(ipKey, tokenKey);
        const ipCount = this.parseCounter(ipCountStr);
        const tokenCount = this.parseCounter(tokenCountStr);

        if (tokenCount >= this.registrationTokenMaxAttempts) {
          let ttl = await this.redis.ttl(tokenKey);
          if (ttl <= 0) ttl = this.registrationBlockWindowSeconds;

          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'Too Many Requests',
              message: `Demasiados intentos de registro para esta invitación. Intente nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
              retryAfter: ttl,
              limitType: 'INVITATION_TOKEN',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        if (ipCount >= this.registrationIpMaxAttempts) {
          let ttl = await this.redis.ttl(ipKey);
          if (ttl <= 0) ttl = this.registrationBlockWindowSeconds;

          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'Too Many Requests',
              message: `Demasiados intentos de registro desde esta dirección IP. Intente nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
              retryAfter: ttl,
              limitType: 'REGISTRATION_IP',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      } else {
        const ipCountStr = await this.redis.get(ipKey);
        const ipCount = this.parseCounter(ipCountStr);

        if (ipCount >= this.registrationIpMaxAttempts) {
          let ttl = await this.redis.ttl(ipKey);
          if (ttl <= 0) ttl = this.registrationBlockWindowSeconds;

          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'Too Many Requests',
              message: `Demasiados intentos de registro desde esta dirección IP. Intente nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
              retryAfter: ttl,
              limitType: 'REGISTRATION_IP',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.handleRedisError(error, 'assertRegistrationAllowed');
    }
  }

  /**
   * Registra un intento fallido de registro incrementando atómicamente el contador de la IP
   * y del token (si fue provisto) con ventana de bloqueo independiente.
   */
  async recordRegistrationFailure(ip: string, token?: string): Promise<void> {
    this.validateIp(ip);
    if (token !== undefined && (typeof token !== 'string' || token.trim().length === 0)) {
      throw new BadRequestException('Token inválido para control de tasa');
    }

    const ipKey = this.getRegistrationIpKey(ip);
    const tokenKey = token ? this.getRegistrationTokenKey(token) : null;

    try {
      if (tokenKey) {
        await this.redis.eval(
          RECORD_FAILURE_LUA_SCRIPT,
          2,
          tokenKey,
          ipKey,
          this.registrationBlockWindowSeconds.toString(),
        );
      } else {
        await this.redis.eval(
          RECORD_SINGLE_FAILURE_LUA_SCRIPT,
          1,
          ipKey,
          this.registrationBlockWindowSeconds.toString(),
        );
      }
    } catch (error) {
      this.handleRedisError(error, 'recordRegistrationFailure');
    }
  }

  /**
   * Verifica si la petición de pre-validación de invitación tiene permitido continuar.
   *
   * Reglas:
   * 1. Si la IP tiene >= 30 consultas fallidas de validación, bloquea con HTTP 429 (INVITATION_VALIDATION_IP).
   * 2. Ante falla o desconexión de Redis, aplica Fail-Closed arrojando HTTP 503.
   */
  async assertInvitationValidationAllowed(ip: string): Promise<void> {
    this.validateIp(ip);
    const ipKey = this.getInvitationValidationIpKey(ip);

    try {
      const countStr = await this.redis.get(ipKey);
      const count = this.parseCounter(countStr);

      if (count >= this.invitationValidationIpMaxAttempts) {
        let ttl = await this.redis.ttl(ipKey);
        if (ttl <= 0) ttl = this.registrationBlockWindowSeconds;

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `Demasiadas consultas de validación desde esta dirección IP. Intente nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
            retryAfter: ttl,
            limitType: 'INVITATION_VALIDATION_IP',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.handleRedisError(error, 'assertInvitationValidationAllowed');
    }
  }

  /**
   * Registra un intento fallido de consulta/validación de invitación por IP.
   */
  async recordInvitationValidationFailure(ip: string): Promise<void> {
    this.validateIp(ip);
    const ipKey = this.getInvitationValidationIpKey(ip);

    try {
      await this.redis.eval(
        RECORD_SINGLE_FAILURE_LUA_SCRIPT,
        1,
        ipKey,
        this.registrationBlockWindowSeconds.toString(),
      );
    } catch (error) {
      this.handleRedisError(error, 'recordInvitationValidationFailure');
    }
  }

  private validateIp(ip: string): void {
    if (typeof ip !== 'string' || isIP(ip.trim()) === 0) {
      throw new BadRequestException('Dirección IP inválida para control de tasa');
    }
  }

  private validateInputs(email: string, ip: string): void {
    if (
      typeof email !== 'string' ||
      email.trim().length === 0 ||
      email.length > 255
    ) {
      throw new BadRequestException('Email inválido para control de tasa');
    }

    this.validateIp(ip);
  }

  /**
   * Parsea y valida el contador retornado por Redis.
   * Exige estrictamente una secuencia de dígitos decimales (/^\d+$/) y un entero seguro.
   * Si el valor es inválido (hexadecimal, binario, exponencial, decimal fraccionario,
   * negativo, vacío o fuera de rango seguro), lanza un Error sin reflejar el valor
   * que activa la política Fail-Closed (HTTP 503).
   */
  private parseCounter(value: string | null): number {
    if (value === null) return 0;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error('Contador con formato no decimal recibido desde Redis');
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error('Contador fuera del rango entero seguro recibido desde Redis');
    }
    return parsed;
  }

  /**
   * Manejo estricto Fail-Closed:
   * Registra el fallo de infraestructura sanitizando el error sin exponer credenciales,
   * correos, IPs ni cadenas de conexión, y responde siempre con HTTP 503.
   */
  private handleRedisError(error: unknown, operation: string): never {
    const errorType = error instanceof Error ? 'Error' : 'UnknownError';
    const rawCode = (error as { code?: unknown })?.code;
    const errorCode =
      typeof rawCode === 'string' &&
      AuthRateLimiterService.SAFE_ERROR_CODES.has(rawCode)
        ? rawCode
        : 'REDIS_ERROR';

    this.logger.error({
      message: `Falla en servicio de Redis durante operación ${operation}`,
      errorType,
      errorCode,
    });

    throw new ServiceUnavailableException(
      'Servicio de autenticación no disponible temporalmente. Intente nuevamente más tarde.',
    );
  }
}
