/* Elige la base y el Redis de los tests de integración y corta si no están aislados del entorno de desarrollo */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, parse } from 'dotenv';
import type Redis from 'ioredis';

const envFile = resolve(__dirname, '../.env');

export const TEST_REDIS_KEY_PREFIX = 'test:e2e:';

const LOCAL_REDIS_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_DEV_REDIS_URL = 'redis://localhost:6379';

let initialEnvCaptured = false;
let initialProcessRedisUrl: string | undefined;
let appliedTestRedisUrl: string | undefined;

export interface NormalizedRedisEndpoint {
  protocol: 'redis:' | 'rediss:';
  /** Host canónico para comparar equivalencia de destino (todo loopback local se normaliza a 'localhost'). */
  host: string;
  /** Hostname devuelto por WHATWG URL en minúsculas (p. ej. 'localhost', '127.0.0.1', '[::1]'). */
  rawHost: string;
  /** Hostname literal esperado en ioredis.options.host (sin corchetes IPv6, p. ej. 'localhost', '127.0.0.1', '::1'). */
  expectedClientHost: string;
  port: number;
  db: number;
}

function loadEnvPreservingInitialRedisUrl(): void {
  if (!initialEnvCaptured) {
    initialProcessRedisUrl = process.env.REDIS_URL;
    initialEnvCaptured = true;
  }
  config({ path: envFile, quiet: true });
}

function isLoopbackOrLocalWildcardHost(rawHost: string): boolean {
  if (LOCAL_REDIS_HOSTS.has(rawHost)) {
    return true;
  }
  return (
    rawHost === '0.0.0.0' ||
    rawHost === '::' ||
    rawHost === '[::]' ||
    rawHost === '[::ffff:7f00:1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rawHost)
  );
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function normalizeRedisEndpoint(
  rawUrl: string,
  label: string,
  options?: { requireLocal?: boolean },
): NormalizedRedisEndpoint {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new Error(`${label} no está definida o está vacía`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`${label} no tiene un formato de URL válido`);
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(
      `${label} tiene un protocolo no admitido "${parsed.protocol}" (se requiere redis: o rediss:)`,
    );
  }

  if (parsed.hash !== '') {
    throw new Error(`${label} no debe incluir fragmentos (#) en la URL`);
  }

  const rawHost = parsed.hostname.trim().toLowerCase();
  if (!rawHost) {
    throw new Error(`${label} no especifica un hostname válido`);
  }

  const isAllowedTestLocal = LOCAL_REDIS_HOSTS.has(rawHost);
  if (options?.requireLocal && !isAllowedTestLocal) {
    throw new Error(
      `${label} apunta a un host no local ("${rawHost}"): las pruebas E2E requieren Redis en localhost, 127.0.0.1 o ::1`,
    );
  }

  if (options?.requireLocal && parsed.search !== '') {
    throw new Error(
      `${label} no debe incluir parámetros de query string: defina host, puerto y base lógica directamente en la URL`,
    );
  }

  const expectedClientHost = rawHost.replace(/^\[|\]$/g, '');
  const host = isLoopbackOrLocalWildcardHost(rawHost) ? 'localhost' : rawHost;

  let port = 6379;
  if (parsed.port !== '') {
    if (!/^\d+$/.test(parsed.port)) {
      throw new Error(`${label} especifica un puerto inválido`);
    }
    const parsedPort = Number(parsed.port);
    if (
      !Number.isInteger(parsedPort) ||
      parsedPort < 1 ||
      parsedPort > 65535
    ) {
      throw new Error(`${label} especifica un puerto fuera de rango`);
    }
    port = parsedPort;
  }

  const rawPath = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (rawPath !== '' && !/^\d+$/.test(rawPath)) {
    throw new Error(
      `${label} especifica una base lógica inválida en la ruta (se requiere un entero no negativo)`,
    );
  }

  let queryDb: string | undefined;
  if (!options?.requireLocal && parsed.search !== '') {
    for (const key of parsed.searchParams.keys()) {
      if (key !== 'db') {
        throw new Error(
          `${label} contiene un parámetro de query no permitido ("${key}") que podría alterar opciones de conexión`,
        );
      }
    }
    if (parsed.searchParams.getAll('db').length > 1) {
      throw new Error(
        `${label} contiene múltiples parámetros "db" en el query string`,
      );
    }
    if (parsed.searchParams.has('db')) {
      const rawQueryDb = parsed.searchParams.get('db')?.trim() ?? '';
      if (!/^\d+$/.test(rawQueryDb)) {
        throw new Error(`${label} especifica un parámetro db inválido`);
      }
      if (rawPath !== '' && Number(rawPath) !== Number(rawQueryDb)) {
        throw new Error(
          `${label} contiene valores de base lógica contradictorios entre ruta y query string`,
        );
      }
      queryDb = rawQueryDb;
    }
  }

  const dbStr = rawPath !== '' ? rawPath : (queryDb ?? '0');
  const db = Number(dbStr);
  if (!Number.isSafeInteger(db) || db < 0) {
    throw new Error(`${label} especifica una base lógica fuera de rango`);
  }

  return {
    protocol: parsed.protocol,
    host,
    rawHost,
    expectedClientHost,
    port,
    db,
  };
}

// Devuelve TEST_DATABASE_URL y la deja en DATABASE_URL, así PrismaService y prisma migrate
// nunca ven la base de desarrollo. Lanza si falta, si el nombre no termina en _test
// o si es la misma URL que el DATABASE_URL de .env.
export function useTestDatabase(): string {
  loadEnvPreservingInitialRedisUrl();

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'Falta TEST_DATABASE_URL: los tests de integración no corren contra la base de desarrollo',
    );
  }
  if (!databaseName(testUrl).endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL apunta a "${databaseName(testUrl)}": el nombre de la base tiene que terminar en _test`,
    );
  }
  const devUrl = existsSync(envFile)
    ? parse(readFileSync(envFile)).DATABASE_URL
    : undefined;
  if (devUrl && devUrl === testUrl) {
    throw new Error('TEST_DATABASE_URL es igual a DATABASE_URL de desarrollo');
  }

  process.env.DATABASE_URL = testUrl;
  return testUrl;
}

// Valida TEST_REDIS_URL asegurando aislamiento respecto de REDIS_URL de desarrollo y
// rechaza localhost:6379 (DB 0). Asigna REDIS_URL y REDIS_KEY_PREFIX='test:e2e:'.
export function useTestRedis(): string {
  loadEnvPreservingInitialRedisUrl();

  const testUrl = process.env.TEST_REDIS_URL?.trim();
  if (!testUrl) {
    throw new Error(
      'Falta TEST_REDIS_URL: las pruebas E2E requieren una configuración explícita de Redis de testing y no pueden usar REDIS_URL por defecto',
    );
  }

  const testEndpoint = normalizeRedisEndpoint(testUrl, 'TEST_REDIS_URL', {
    requireLocal: true,
  });

  if (
    testEndpoint.host === 'localhost' &&
    testEndpoint.port === 6379 &&
    testEndpoint.db === 0
  ) {
    throw new Error(
      'TEST_REDIS_URL inválida: no se permite usar localhost:6379 (DB 0) como destino de pruebas E2E',
    );
  }

  const fileRedisUrl = existsSync(envFile)
    ? parse(readFileSync(envFile)).REDIS_URL?.trim()
    : undefined;
  const initialEnvRedisUrl = initialProcessRedisUrl?.trim();
  const currentUnappliedEnvRedisUrl =
    process.env.REDIS_URL !== undefined &&
    process.env.REDIS_URL !== appliedTestRedisUrl
      ? process.env.REDIS_URL.trim()
      : undefined;

  const effectiveDevUrl =
    initialEnvRedisUrl ||
    currentUnappliedEnvRedisUrl ||
    fileRedisUrl ||
    DEFAULT_DEV_REDIS_URL;

  const devCandidates: Array<{ url: string; label: string }> = [
    { url: effectiveDevUrl, label: 'REDIS_URL de desarrollo' },
  ];

  if (fileRedisUrl && fileRedisUrl !== effectiveDevUrl) {
    devCandidates.push({ url: fileRedisUrl, label: 'REDIS_URL en .env' });
  }
  if (
    currentUnappliedEnvRedisUrl &&
    currentUnappliedEnvRedisUrl !== effectiveDevUrl &&
    currentUnappliedEnvRedisUrl !== fileRedisUrl
  ) {
    devCandidates.push({
      url: currentUnappliedEnvRedisUrl,
      label: 'REDIS_URL en process.env',
    });
  }

  for (const candidate of devCandidates) {
    const devEndpoint = normalizeRedisEndpoint(candidate.url, candidate.label, {
      requireLocal: false,
    });
    if (
      testEndpoint.host === devEndpoint.host &&
      testEndpoint.port === devEndpoint.port &&
      testEndpoint.db === devEndpoint.db
    ) {
      throw new Error(
        `TEST_REDIS_URL apunta al mismo destino efectivo que ${candidate.label} (${testEndpoint.host}:${testEndpoint.port}, DB ${testEndpoint.db})`,
      );
    }
  }

  appliedTestRedisUrl = testUrl;
  process.env.REDIS_URL = testUrl;
  process.env.REDIS_KEY_PREFIX = TEST_REDIS_KEY_PREFIX;
  return testUrl;
}

export function assertTestRedisClientOptions(
  redis: Redis,
): NormalizedRedisEndpoint {
  const activeUrl = process.env.REDIS_URL?.trim();
  const testUrl = process.env.TEST_REDIS_URL?.trim();
  if (!testUrl) {
    throw new Error(
      'Operación E2E abortada: TEST_REDIS_URL no está configurada',
    );
  }
  if (!activeUrl || activeUrl !== testUrl) {
    throw new Error(
      'Operación E2E abortada: REDIS_URL no coincide con TEST_REDIS_URL',
    );
  }

  useTestRedis();
  const expected = normalizeRedisEndpoint(testUrl, 'TEST_REDIS_URL', {
    requireLocal: true,
  });

  const rawOptions = redis?.options as Record<string, unknown> | undefined;
  if (!rawOptions || typeof rawOptions !== 'object') {
    throw new Error(
      'Operación E2E abortada: el cliente Redis no expone un objeto options válido',
    );
  }

  if (rawOptions.path !== undefined && rawOptions.path !== null) {
    throw new Error(
      'Operación E2E abortada: no se admiten conexiones Redis por socket Unix (path) en pruebas E2E',
    );
  }

  if (rawOptions.sentinels !== undefined && rawOptions.sentinels !== null) {
    throw new Error(
      'Operación E2E abortada: no se admiten conexiones Redis Sentinel en pruebas E2E',
    );
  }

  if (
    typeof rawOptions.keyPrefix !== 'string' ||
    rawOptions.keyPrefix !== TEST_REDIS_KEY_PREFIX
  ) {
    throw new Error(
      `Operación E2E abortada: el cliente Redis no tiene el keyPrefix requerido ("${TEST_REDIS_KEY_PREFIX}")`,
    );
  }

  if (
    typeof rawOptions.host !== 'string' ||
    rawOptions.host.trim().length === 0
  ) {
    throw new Error(
      'Operación E2E abortada: el cliente Redis no tiene una opción host de tipo string válida',
    );
  }

  const rawClientHost = rawOptions.host.trim().toLowerCase();
  if (!LOCAL_REDIS_HOSTS.has(rawClientHost)) {
    throw new Error(
      `Operación E2E abortada: el cliente Redis apunta a un host no local ("${rawClientHost}")`,
    );
  }

  if (
    typeof rawOptions.port !== 'number' ||
    !Number.isInteger(rawOptions.port) ||
    rawOptions.port < 1 ||
    rawOptions.port > 65535
  ) {
    throw new Error(
      'Operación E2E abortada: el cliente Redis tiene una opción port inválida (se requiere entero entre 1 y 65535)',
    );
  }
  const clientPort = rawOptions.port;

  if (
    typeof rawOptions.db !== 'number' ||
    !Number.isSafeInteger(rawOptions.db) ||
    rawOptions.db < 0
  ) {
    throw new Error(
      'Operación E2E abortada: el cliente Redis tiene una opción db inválida (se requiere entero no negativo)',
    );
  }
  const clientDb = rawOptions.db;

  // Comparación canónica: normaliza los hosts loopback admitidos ('localhost', '127.0.0.1', '::1')
  // a 'localhost' para rechazar el destino por defecto localhost:6379 (DB 0) bajo cualquier alias.
  const canonicalClientHost = 'localhost';
  if (
    canonicalClientHost === 'localhost' &&
    clientPort === 6379 &&
    clientDb === 0
  ) {
    throw new Error(
      'Operación E2E abortada: el cliente Redis apunta a localhost:6379 (DB 0)',
    );
  }

  // Comparación literal: verifica que el hostname literal en ioredis (sin corchetes IPv6),
  // el puerto, la base lógica y el modo TLS coincidan exactamente con TEST_REDIS_URL.
  if (
    rawClientHost !== expected.expectedClientHost ||
    clientPort !== expected.port ||
    clientDb !== expected.db
  ) {
    throw new Error(
      `Operación E2E abortada: el destino del cliente Redis (${rawClientHost}:${clientPort}, DB ${clientDb}) no coincide con TEST_REDIS_URL (${expected.expectedClientHost}:${expected.port}, DB ${expected.db})`,
    );
  }

  const clientHasTls =
    rawOptions.tls !== undefined &&
    rawOptions.tls !== null &&
    rawOptions.tls !== false;
  const expectedHasTls = expected.protocol === 'rediss:';
  if (clientHasTls !== expectedHasTls) {
    throw new Error(
      `Operación E2E abortada: la configuración TLS del cliente Redis (${clientHasTls ? 'rediss:' : 'redis:'}) no coincide con el protocolo de TEST_REDIS_URL (${expected.protocol})`,
    );
  }

  return expected;
}

export async function assertTestRedisIsolated(redis: Redis): Promise<void> {
  const expected = assertTestRedisClientOptions(redis);

  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error('Respuesta inesperada de PING');
    }
  } catch {
    throw new Error(
      `Operación E2E abortada: el servidor Redis de pruebas (${expected.host}:${expected.port}, DB ${expected.db}) no respondió a PING`,
    );
  }
}
