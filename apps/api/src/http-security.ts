import type { INestApplication } from '@nestjs/common';
import { isIP } from 'node:net';

type Environment = Record<string, unknown>;

const MAX_TRUSTED_PROXY_ENTRIES = 32;

export interface HttpSecurityPolicy {
  swaggerEnabled: boolean;
  trustedProxies: readonly string[];
}

/**
 * Resuelve una política HTTP explícita. La confianza en proxies queda apagada
 * si infraestructura no entrega una lista auditable de IP o CIDR.
 */
export function resolveHttpSecurityPolicy(
  environment: Environment,
): HttpSecurityPolicy {
  const nodeEnv = optionalString(environment, 'NODE_ENV');
  const swaggerOptIn = optionalBoolean(environment, 'SWAGGER_ENABLED');

  return {
    swaggerEnabled:
      swaggerOptIn !== undefined ? swaggerOptIn : nodeEnv !== 'production',
    trustedProxies: parseTrustedProxies(environment.HTTP_TRUSTED_PROXIES),
  };
}

export function configureHttpAdapter(
  app: INestApplication,
  policy: HttpSecurityPolicy,
): void {
  const adapter = app.getHttpAdapter();
  if (adapter.getType() !== 'express') {
    throw new Error(
      'Configuración HTTP inválida: la política de proxy requiere el adaptador Express',
    );
  }

  const express = adapter.getInstance() as {
    disable(name: string): void;
    set(name: string, value: boolean | readonly string[]): void;
  };

  express.disable('x-powered-by');
  express.set(
    'trust proxy',
    policy.trustedProxies.length > 0 ? policy.trustedProxies : false,
  );

  // Cabeceras que no dependen de TLS ni de contenido. HSTS y CSP quedan
  // pendientes de asignar al edge o a la API con la topología ya confirmada.
  app.use(
    (
      _request: unknown,
      response: {
        setHeader(name: string, value: string): void;
      },
      next: () => void,
    ) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader(
        'Permissions-Policy',
        'camera=(), geolocation=(), microphone=()',
      );
      next();
    },
  );
}

export function parseTrustedProxies(value: unknown): readonly string[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'string') {
    invalid('HTTP_TRUSTED_PROXIES', 'debe ser texto');
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return [];

  const entries = trimmed.split(',').map((entry) => entry.trim());
  if (entries.length > MAX_TRUSTED_PROXY_ENTRIES) {
    invalid(
      'HTTP_TRUSTED_PROXIES',
      `admite como máximo ${MAX_TRUSTED_PROXY_ENTRIES} entradas`,
    );
  }
  if (entries.some((entry) => entry.length === 0)) {
    invalid('HTTP_TRUSTED_PROXIES', 'contiene una entrada vacía');
  }

  for (const entry of entries) validateProxyEntry(entry);
  if (new Set(entries).size !== entries.length) {
    invalid('HTTP_TRUSTED_PROXIES', 'contiene entradas duplicadas');
  }

  return entries;
}

function validateProxyEntry(entry: string): void {
  const [address, prefix, extra] = entry.split('/');
  if (extra !== undefined || !address || isIP(address) === 0) {
    invalid('HTTP_TRUSTED_PROXIES', 'sólo admite direcciones IP o rangos CIDR');
  }
  if (prefix === undefined) return;
  if (!/^\d+$/.test(prefix)) {
    invalid('HTTP_TRUSTED_PROXIES', 'contiene un prefijo CIDR inválido');
  }

  const maxPrefix = isIP(address) === 4 ? 32 : 128;
  const numericPrefix = Number(prefix);
  if (numericPrefix < 0 || numericPrefix > maxPrefix) {
    invalid('HTTP_TRUSTED_PROXIES', 'contiene un prefijo CIDR inválido');
  }

  if (numericPrefix === 0) {
    invalid('HTTP_TRUSTED_PROXIES', 'no permite rangos CIDR universales');
  }
}

function optionalString(
  environment: Environment,
  name: string,
): string | undefined {
  const value = environment[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') invalid(name, 'debe ser texto');
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(
  environment: Environment,
  name: string,
): boolean | undefined {
  const value = optionalString(environment, name);
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  invalid(name, "sólo admite 'true' o 'false'");
}

function invalid(name: string, reason: string): never {
  throw new Error(`Configuración inválida: ${name} ${reason}`);
}
