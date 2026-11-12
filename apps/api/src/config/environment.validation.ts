import { resolveHttpSecurityPolicy } from '../http-security';

const MIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_S3_FORCE_PATH_STYLE = 'false';

type Environment = Record<string, unknown>;

/**
 * Valida el contrato mínimo de configuración antes de crear servicios con
 * conexiones o credenciales. Los errores nombran variables, nunca valores.
 *
 * La forma exacta de TLS (CA, parámetros y terminación) depende del proveedor
 * todavía no aprobado. Por eso se rechaza desactivar TLS explícitamente, pero
 * no se impone hoy un parámetro propio de AWS ni un esquema único.
 */
export function validateEnvironment(environment: Environment): Environment {
  const isProduction = optionalString(environment, 'NODE_ENV') === 'production';

  validatePort(environment);
  validateTimeZone(environment);
  validateProcessingWorker(environment);
  resolveHttpSecurityPolicy(environment);
  validateDatabase(environment, isProduction);
  validateJwt(environment, isProduction);
  validateRedis(environment, isProduction);
  validateStorage(environment, isProduction);
  validateInvitationDelivery(environment, isProduction);
  validateGemini(environment);

  return environment;
}

function validatePort(environment: Environment): void {
  const rawValue = environment.PORT;
  if (rawValue === undefined || rawValue === null) return;
  if (typeof rawValue !== 'string') {
    invalid('PORT', 'debe ser texto');
  }
  const value = rawValue.trim();

  if (!/^\d+$/.test(value)) {
    invalid('PORT', 'debe ser un entero entre 1 y 65535');
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    invalid('PORT', 'debe ser un entero entre 1 y 65535');
  }
}

function validateTimeZone(environment: Environment): void {
  const value = optionalString(environment, 'APP_TIMEZONE');
  if (value === undefined) return;

  try {
    new Intl.DateTimeFormat('es-AR', { timeZone: value }).format();
  } catch {
    invalid('APP_TIMEZONE', 'debe ser una zona horaria IANA válida');
  }
}

function validateProcessingWorker(environment: Environment): void {
  const rawValue = environment.PROCESSING_WORKER_ENABLED;
  if (rawValue === undefined || rawValue === null) return;
  if (typeof rawValue !== 'string') {
    invalid('PROCESSING_WORKER_ENABLED', 'debe ser texto');
  }
  const value = rawValue.trim();

  if (value !== 'true' && value !== 'false') {
    invalid('PROCESSING_WORKER_ENABLED', "sólo admite 'true' o 'false'");
  }
}

function validateDatabase(
  environment: Environment,
  isProduction: boolean,
): void {
  const value = isProduction
    ? requiredString(environment, 'DATABASE_URL')
    : optionalString(environment, 'DATABASE_URL');
  if (value === undefined) return;

  const url = connectionUrl('DATABASE_URL', value, [
    'postgres:',
    'postgresql:',
  ]);
  rejectExplicitTlsDisable('DATABASE_URL', url, isProduction);
}

function validateJwt(environment: Environment, isProduction: boolean): void {
  if (!isProduction) return;

  const value = requiredString(environment, 'JWT_SECRET');
  if (value.length < MIN_JWT_SECRET_LENGTH) {
    invalid(
      'JWT_SECRET',
      `debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres en producción`,
    );
  }
}

function validateRedis(environment: Environment, isProduction: boolean): void {
  const value = isProduction
    ? requiredString(environment, 'REDIS_URL')
    : optionalString(environment, 'REDIS_URL');
  if (value === undefined) return;

  const url = connectionUrl('REDIS_URL', value, ['redis:', 'rediss:']);
  validateRedisDatabase(url);
  if (isProduction && isLocalOrLoopback(url.hostname)) {
    invalid(
      'REDIS_URL',
      'no puede apuntar a localhost o loopback en producción',
    );
  }
  rejectExplicitTlsDisable('REDIS_URL', url, isProduction);
}

function validateStorage(
  environment: Environment,
  isProduction: boolean,
): void {
  const bucket = optionalString(environment, 'S3_BUCKET');
  const region = optionalString(environment, 'AWS_REGION');
  const endpoint = optionalString(environment, 'S3_ENDPOINT');
  const forcePathStyle =
    optionalString(environment, 'S3_FORCE_PATH_STYLE') ??
    DEFAULT_S3_FORCE_PATH_STYLE;

  if (isProduction && bucket === undefined) {
    required('S3_BUCKET');
  }
  if (bucket !== undefined && region === undefined) {
    required('AWS_REGION', 'cuando S3_BUCKET está configurada');
  }
  if (endpoint !== undefined) {
    const url = absoluteUrl('S3_ENDPOINT', endpoint);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      invalid('S3_ENDPOINT', 'debe usar HTTP o HTTPS');
    }
    if (url.username || url.password) {
      invalid('S3_ENDPOINT', 'no debe incluir credenciales');
    }
    rejectExplicitTlsDisable('S3_ENDPOINT', url, isProduction);
  }
  if (forcePathStyle !== 'true' && forcePathStyle !== 'false') {
    invalid('S3_FORCE_PATH_STYLE', "sólo admite 'true' o 'false'");
  }

  const accessKeyId = optionalString(environment, 'AWS_ACCESS_KEY_ID');
  const secretAccessKey = optionalString(environment, 'AWS_SECRET_ACCESS_KEY');
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    invalid(
      'AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY',
      'deben configurarse juntas o reemplazarse por una identidad del runtime',
    );
  }
}

function validateInvitationDelivery(
  environment: Environment,
  isProduction: boolean,
): void {
  const provider = optionalString(environment, 'INVITATION_EMAIL_PROVIDER');
  if (provider !== undefined && provider !== 'local' && provider !== 'resend') {
    invalid('INVITATION_EMAIL_PROVIDER', "sólo admite 'local' o 'resend'");
  }
  if (provider !== 'resend') return;

  requiredString(environment, 'RESEND_API_KEY');
  const from = requiredString(environment, 'INVITATION_EMAIL_FROM');
  if (!validEmailFrom(from)) {
    invalid('INVITATION_EMAIL_FROM', 'no tiene un formato válido');
  }

  const frontendUrl = absoluteUrl(
    'FRONTEND_URL',
    requiredString(environment, 'FRONTEND_URL'),
  );
  if (isProduction && frontendUrl.protocol !== 'https:') {
    invalid('FRONTEND_URL', 'debe usar HTTPS en producción');
  }
  if (frontendUrl.protocol !== 'http:' && frontendUrl.protocol !== 'https:') {
    invalid('FRONTEND_URL', 'debe usar HTTP o HTTPS');
  }
  if (
    frontendUrl.username ||
    frontendUrl.password ||
    frontendUrl.search ||
    frontendUrl.hash
  ) {
    invalid('FRONTEND_URL', 'no debe incluir credenciales, query ni fragmento');
  }
}

function validateGemini(environment: Environment): void {
  const model = optionalString(environment, 'GEMINI_CHAT_MODEL');
  if (model !== undefined) {
    requiredString(environment, 'GOOGLE_GENERATIVE_AI_API_KEY');
  }
}

function connectionUrl(
  name: string,
  value: string,
  protocols: readonly string[],
): URL {
  const url = absoluteUrl(name, value);
  if (!protocols.includes(url.protocol)) {
    invalid(name, 'tiene un protocolo no admitido');
  }
  if (!url.hostname) {
    invalid(name, 'debe incluir un host');
  }
  if (url.port && Number(url.port) < 1) {
    invalid(name, 'tiene un puerto inválido');
  }
  return url;
}

function validateRedisDatabase(url: URL): void {
  if (url.pathname === '' || url.pathname === '/') return;

  const database = url.pathname.slice(1);
  if (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database))) {
    invalid('REDIS_URL', 'tiene un número de base inválido');
  }

  try {
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    invalid('REDIS_URL', 'tiene credenciales codificadas inválidas');
  }
}

function absoluteUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    invalid(name, 'no es una URL válida');
  }
}

function rejectExplicitTlsDisable(
  name: string,
  url: URL,
  isProduction: boolean,
): void {
  if (!isProduction) return;

  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
  const ssl = url.searchParams.get('ssl')?.toLowerCase();
  const tls = url.searchParams.get('tls')?.toLowerCase();
  if (sslMode === 'disable' || ssl === 'false' || tls === 'false') {
    invalid(name, 'no puede desactivar TLS explícitamente en producción');
  }
}

function isLocalOrLoopback(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'host.docker.internal' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '0.0.0.0' ||
    host === '::'
  ) {
    return true;
  }

  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  return /^(?:::ffff:|0:0:0:0:0:ffff:)127\./.test(host);
}

function validEmailFrom(value: string): boolean {
  if (/[\r\n]/.test(value)) return false;

  const match = value.match(/^[^<>]+<([^<>]+)>$/);
  const email = (match?.[1] ?? value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

function optionalString(
  environment: Environment,
  name: string,
): string | undefined {
  const value = environment[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    invalid(name, 'debe ser texto');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredString(environment: Environment, name: string): string {
  const value = optionalString(environment, name);
  if (value === undefined) required(name);
  return value;
}

function required(name: string, context?: string): never {
  throw new Error(
    `Configuración inválida: ${name} es obligatoria${context ? ` ${context}` : ''}`,
  );
}

function invalid(name: string, reason: string): never {
  throw new Error(`Configuración inválida: ${name} ${reason}`);
}
