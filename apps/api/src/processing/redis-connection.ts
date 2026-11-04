/* Convierte REDIS_URL en opciones de conexión para BullMQ (plan 5.1). BullMQ necesita su propia
   conexión: el cliente de Redis del proyecto (REDIS_CLIENT) tiene comandos cortos y no sirve para
   el worker, que espera trabajos en bloque. */
import type { ConnectionOptions } from 'bullmq';

export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export function redisConnectionFromUrl(url: string): ConnectionOptions {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // No incluir la URL en el mensaje: puede tener la contraseña.
    throw new Error('REDIS_URL no es una URL válida');
  }
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL tiene que empezar con redis:// o rediss://');
  }
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0) throw new Error('REDIS_URL tiene un número de base inválido');

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}