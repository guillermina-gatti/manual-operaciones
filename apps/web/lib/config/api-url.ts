// Dirección del backend al que Next reenvía /api (plan 002, sección 2).
// Se lee solo en el servidor de Next: sin el prefijo NEXT_PUBLIC_, no termina en el JavaScript del navegador.
export const API_URL_ENV_VAR = 'API_URL';

// La API escucha en el puerto 3000 por defecto (apps/api/src/main.ts); la web corre en el 3001 (D3).
export const DEFAULT_DEV_API_URL = 'http://localhost:3000';

type Env = Partial<Record<string, string>>;

export function resolveApiUrl(env: Env): string {
  const value = env[API_URL_ENV_VAR]?.trim();
  const isProduction = env.NODE_ENV === 'production';
  if (!value) {
    if (!isProduction) return DEFAULT_DEV_API_URL;
    throw new Error(
      `Falta ${API_URL_ENV_VAR}: la dirección del backend al que se reenvía /api`,
    );
  }

  const url = parseHttpUrl(value);
  if (url.username || url.password) {
    invalidApiUrl('no debe incluir credenciales');
  }
  if (url.search || url.hash) {
    invalidApiUrl('no debe incluir query ni fragmento');
  }
  if (url.pathname !== '/') {
    invalidApiUrl('no debe incluir rutas, incluido /api');
  }
  if (isProduction && url.protocol !== 'https:') {
    invalidApiUrl('debe usar HTTPS en producción');
  }
  if (isProduction && isLocalDestination(url.hostname)) {
    invalidApiUrl('no puede apuntar a un destino local en producción');
  }

  return url.origin;
}

function parseHttpUrl(value: string): URL {
  if (!/^https?:\/\//i.test(value)) {
    invalidApiUrl('debe ser una URL HTTP(S) absoluta');
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      invalidApiUrl('debe usar HTTP o HTTPS');
    }
    return url;
  } catch {
    invalidApiUrl('debe ser una URL HTTP(S) absoluta válida');
  }
}

function isLocalDestination(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'host.docker.internal' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }

  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  return isIpv4MappedLoopback(host);
}

function isIpv4MappedLoopback(host: string): boolean {
  const match = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!match) return false;

  const high = Number.parseInt(match[1], 16);
  return high >> 8 === 127;
}

function invalidApiUrl(reason: string): never {
  throw new Error(`Configuración inválida: ${API_URL_ENV_VAR} ${reason}`);
}
