import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_BASE64URL_REGEX,
} from './token.utils';

/**
 * Tiempo de vida estándar de una sesión en días (7 días).
 */
export const SESSION_TTL_DAYS = 7;

/**
 * Tiempo de vida estándar de una sesión en milisegundos (7 días = 604.800.000 ms).
 */
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Longitud máxima permitida para userAgent según la definición de columna VarChar(500).
 */
export const MAX_USER_AGENT_LENGTH = 500;

/**
 * Longitud máxima permitida para ipAddress según la definición de columna VarChar(45).
 */
export const MAX_IP_ADDRESS_LENGTH = 45;

/**
 * Expresión regular para validar el formato estándar de UUID (8-4-4-4-12 caracteres hexadecimales).
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface CreateSessionParams extends SessionMetadata {
  userId: string;
}

export interface SessionPublicData {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface CreateSessionResult {
  refreshToken: string;
  session: SessionPublicData;
}

export type RotateSessionStatus =
  | 'SUCCESS'
  | 'INVALID_TOKEN'
  | 'EXPIRED'
  | 'MANUALLY_REVOKED'
  | 'CAS_RACE_LOST'
  | 'TOKEN_REUSE_DETECTED';

export interface RotateSessionResult {
  status: RotateSessionStatus;
  newRefreshToken?: string;
  newSession?: SessionPublicData;
  userId?: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea y persiste una nueva sesión para el usuario indicado.
   *
   * - Genera un refresh token criptográficamente seguro de 256 bits (base64url).
   * - Almacena exclusivamente el hash SHA-256 en la base de datos (nunca el token plano).
   * - Establece una vigencia de 7 días a partir del momento de creación.
   * - Valida explícitamente los límites de columnas de userAgent (500) e ipAddress (45) sin truncamiento silencioso.
   * - Retorna el token original una sola vez al llamador autorizado y los metadatos de sesión,
   *   omitiendo deliberadamente el hash del token.
   *
   * @param params Identificador de usuario y metadatos opcionales de conexión.
   * @throws Error si el identificador de usuario es inválido, vacío, o si los metadatos exceden la longitud máxima.
   */
  async createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
    if (typeof params?.userId !== 'string' || params.userId.trim().length === 0) {
      throw new Error('El identificador de usuario no puede estar vacío');
    }

    const trimmedUserId = params.userId.trim();
    if (!UUID_REGEX.test(trimmedUserId)) {
      throw new Error('El identificador de usuario debe ser un UUID válido');
    }

    if (
      params.userAgent !== undefined &&
      params.userAgent !== null &&
      params.userAgent.length > MAX_USER_AGENT_LENGTH
    ) {
      throw new Error(
        `userAgent excede la longitud máxima permitida de ${MAX_USER_AGENT_LENGTH} caracteres`,
      );
    }

    if (
      params.ipAddress !== undefined &&
      params.ipAddress !== null &&
      params.ipAddress.length > MAX_IP_ADDRESS_LENGTH
    ) {
      throw new Error(
        `ipAddress excede la longitud máxima permitida de ${MAX_IP_ADDRESS_LENGTH} caracteres`,
      );
    }

    const rawToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const session = await this.prisma.session.create({
      data: {
        userId: trimmedUserId,
        tokenHash,
        expiresAt,
        userAgent: params.userAgent ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });

    return {
      refreshToken: rawToken,
      session: {
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
      },
    };
  }

  /**
   * Valida una sesión a partir de un refresh token presentado por un consumidor.
   *
   * - Prevalida el formato sintáctico base64url antes de cualquier operación criptográfica
   *   o consulta a la base de datos (fail-closed inmediato ante formatos anómalos).
   * - Busca la sesión por su hash SHA-256.
   * - Considera válida únicamente una sesión que exista, no esté revocada y no haya expirado.
   * - Devuelve los metadatos públicos de la sesión o `null` de forma unificada si no es válida,
   *   sin revelar la causa específica (inexistente, revocada o expirada).
   *
   * @param refreshToken Token de refresco opaco presentado por el cliente.
   * @returns Datos públicos de la sesión si es válida y activa, o `null` si no lo es.
   */
  async validateSession(refreshToken: string): Promise<SessionPublicData | null> {
    if (
      typeof refreshToken !== 'string' ||
      !REFRESH_TOKEN_BASE64URL_REGEX.test(refreshToken)
    ) {
      return null;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      return null;
    }

    if (session.isRevoked) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    };
  }

  /**
   * Rota atómicamente un refresh token válido, emitiendo una nueva sesión y revocando la anterior de forma consistente.
   *
   * - Prevalida el formato base64url y límites de metadatos.
   * - Ejecuta la reclamación condicional CAS y la creación de la nueva sesión dentro de una transacción atómica.
   * - Revierte automáticamente en PostgreSQL la sesión tentativa creada si se pierde la carrera CAS (claimed.count === 0).
   * - Asigna `replacedById` apuntando a la nueva sesión.
   * - Clasifica como `TOKEN_REUSE_DETECTED` cualquier presentación de una sesión ya revocada y reemplazada,
   *   según el estado persistido en base de datos.
   *
   * @param oldRefreshToken Token de refresco presentado por el cliente para renovar sesión.
   * @param metadata Metadatos opcionales de conexión para la nueva sesión.
   */
  async rotateSession(
    oldRefreshToken: string,
    metadata?: SessionMetadata,
  ): Promise<RotateSessionResult> {
    if (
      typeof oldRefreshToken !== 'string' ||
      !REFRESH_TOKEN_BASE64URL_REGEX.test(oldRefreshToken)
    ) {
      return { status: 'INVALID_TOKEN' };
    }

    if (
      metadata?.userAgent !== undefined &&
      metadata.userAgent !== null &&
      metadata.userAgent.length > MAX_USER_AGENT_LENGTH
    ) {
      throw new Error(
        `userAgent excede la longitud máxima permitida de ${MAX_USER_AGENT_LENGTH} caracteres`,
      );
    }

    if (
      metadata?.ipAddress !== undefined &&
      metadata.ipAddress !== null &&
      metadata.ipAddress.length > MAX_IP_ADDRESS_LENGTH
    ) {
      throw new Error(
        `ipAddress excede la longitud máxima permitida de ${MAX_IP_ADDRESS_LENGTH} caracteres`,
      );
    }

    const oldHash = hashRefreshToken(oldRefreshToken);
    const now = new Date();

    const existing = await this.prisma.session.findUnique({
      where: { tokenHash: oldHash },
    });

    if (!existing) {
      return { status: 'INVALID_TOKEN' };
    }

    // Si ya estaba revocada antes de intentar rotar:
    if (existing.isRevoked) {
      if (existing.replacedById !== null) {
        return {
          status: 'TOKEN_REUSE_DETECTED',
          userId: existing.userId,
        };
      }
      return { status: 'MANUALLY_REVOKED', userId: existing.userId };
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      return { status: 'EXPIRED', userId: existing.userId };
    }

    const newRawToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRawToken);
    const newExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    // Transacción atómica: reclamación condicional y creación de nueva sesión
    const txResult = await this.prisma
      .$transaction(async (tx) => {
        // 1. Crear la nueva sesión
        const createdNew = await tx.session.create({
          data: {
            userId: existing.userId,
            tokenHash: newHash,
            expiresAt: newExpiresAt,
            userAgent: metadata?.userAgent ?? null,
            ipAddress: metadata?.ipAddress ?? null,
          },
        });

        // 2. Reclamación condicional atómica de la sesión vieja
        const claimed = await tx.session.updateMany({
          where: {
            id: existing.id,
            isRevoked: false,
            expiresAt: { gt: now },
          },
          data: {
            isRevoked: true,
            replacedById: createdNew.id,
          },
        });

        if (claimed.count === 0) {
          // Si otra solicitud reclamó la sesión simultáneamente, forzamos rollback
          throw new Error('CONCURRENT_RACE_LOST');
        }

        return createdNew;
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === 'CONCURRENT_RACE_LOST') {
          return null;
        }
        throw err;
      });

    // Si la transacción falló por pérdida de la carrera condicional CAS:
    if (!txResult) {
      return { status: 'CAS_RACE_LOST', userId: existing.userId };
    }

    return {
      status: 'SUCCESS',
      newRefreshToken: newRawToken,
      userId: existing.userId,
      newSession: {
        id: txResult.id,
        userId: txResult.userId,
        expiresAt: txResult.expiresAt,
        createdAt: txResult.createdAt,
        updatedAt: txResult.updatedAt,
        userAgent: txResult.userAgent,
        ipAddress: txResult.ipAddress,
      },
    };
  }

  /**
   * Revoca una sesión específica por su identificador único de forma idempotente.
   *
   * - Si el identificador no cumple formato UUID, retorna `false` inmediatamente sin consultar Prisma.
   * - Solo revoca la sesión si existe y se encuentra activa (`isRevoked: false`).
   * - No produce errores si la sesión no existe o si ya estaba previamente revocada.
   *
   * @param sessionId Identificador único (UUID) de la sesión.
   * @returns `true` si se revocó una sesión que estaba activa, `false` si no había una sesión activa que revocar.
   * @throws Error si el identificador de sesión es inválido o está vacío.
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new Error('El identificador de sesión no puede estar vacío');
    }

    const trimmedId = sessionId.trim();
    if (!UUID_REGEX.test(trimmedId)) {
      return false;
    }

    const result = await this.prisma.session.updateMany({
      where: {
        id: trimmedId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
      },
    });

    return result.count > 0;
  }

  /**
   * Revoca todas las sesiones activas de un usuario determinado.
   *
   * - Operación acotada exclusivamente al usuario especificado (`userId`).
   * - Afecta únicamente las sesiones no revocadas (`isRevoked: false`).
   *
   * @param userId Identificador único (UUID) del usuario.
   * @returns Cantidad de sesiones activas que fueron revocadas.
   * @throws Error si el identificador de usuario es inválido, vacío, o no cumple formato UUID.
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('El identificador de usuario no puede estar vacío');
    }

    const trimmedUserId = userId.trim();
    if (!UUID_REGEX.test(trimmedUserId)) {
      throw new Error('El identificador de usuario debe ser un UUID válido');
    }

    const result = await this.prisma.session.updateMany({
      where: {
        userId: trimmedUserId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
      },
    });

    return result.count;
  }
}
