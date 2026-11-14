import { describe, expect, test } from 'vitest';
import {
  API_URL_ENV_VAR,
  DEFAULT_DEV_API_URL,
  resolveApiUrl,
} from '@/lib/config/api-url';

describe('resolveApiUrl', () => {
  test('acepta HTTPS productivo y normaliza la barra final', () => {
    expect(
      resolveApiUrl({
        NODE_ENV: 'production',
        API_URL: 'https://api.ejemplo.com:8443/',
      }),
    ).toBe('https://api.ejemplo.com:8443');
    expect(
      resolveApiUrl({
        NODE_ENV: 'production',
        API_URL: '  https://api.ejemplo.com  ',
      }),
    ).toBe('https://api.ejemplo.com');
  });

  test('sin API_URL en desarrollo usa la API local en el puerto 3000', () => {
    expect(resolveApiUrl({ NODE_ENV: 'development' })).toBe(
      'http://localhost:3000',
    );
    expect(DEFAULT_DEV_API_URL).toBe('http://localhost:3000');
  });

  test('una API_URL vacía cuenta como no definida', () => {
    expect(resolveApiUrl({ NODE_ENV: 'development', API_URL: '  ' })).toBe(
      'http://localhost:3000',
    );
  });

  test('sin API_URL en producción lanza un error', () => {
    expect(() => resolveApiUrl({ NODE_ENV: 'production' })).toThrow(/API_URL/);
  });

  test('desarrollo conserva destinos HTTP locales explícitos', () => {
    expect(
      resolveApiUrl({
        NODE_ENV: 'development',
        API_URL: 'http://127.0.0.1:4000/',
      }),
    ).toBe('http://127.0.0.1:4000');
  });

  test.each([
    ['relativa', '/backend'],
    ['sin separador de URL', 'https:api.ejemplo.com'],
    ['protocolo no HTTP', 'ftp://api.ejemplo.com'],
    ['malformada', 'https://[::1'],
    ['con credenciales', 'https://usuario:secreto@api.ejemplo.com'],
    ['con query', 'https://api.ejemplo.com?modo=interno'],
    ['con fragmento', 'https://api.ejemplo.com#interno'],
    ['con /api', 'https://api.ejemplo.com/api'],
    ['con /api/', 'https://api.ejemplo.com/api/'],
    ['con otra ruta', 'https://api.ejemplo.com/backend'],
    ['con barras adicionales', 'https://api.ejemplo.com///'],
  ])('rechaza una API_URL %s', (_caseName, value) => {
    expect(() =>
      resolveApiUrl({ NODE_ENV: 'development', API_URL: value }),
    ).toThrow(/API_URL/);
  });

  test.each([
    ['HTTP público', 'http://api.ejemplo.com'],
    ['localhost', 'https://localhost:3000'],
    ['subdominio localhost', 'https://api.localhost'],
    ['IPv4 loopback', 'https://127.0.0.1:3000'],
    ['IPv4 loopback abreviada', 'https://127.1:3000'],
    ['IPv6 loopback', 'https://[::1]:3000'],
    ['IPv4 mapeada en IPv6', 'https://[::ffff:127.0.0.1]:3000'],
    ['dirección no especificada', 'https://0.0.0.0:3000'],
    ['host de Docker Desktop', 'https://host.docker.internal:3000'],
  ])('rechaza %s en producción', (_caseName, value) => {
    expect(() =>
      resolveApiUrl({ NODE_ENV: 'production', API_URL: value }),
    ).toThrow(/API_URL/);
  });

  test('los errores no incluyen el valor ni credenciales', () => {
    const unsafeValue =
      'https://persona:secreto-no-real@backend.interno.example/api';

    try {
      resolveApiUrl({ NODE_ENV: 'production', API_URL: unsafeValue });
      throw new Error('La validación debía fallar');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('API_URL');
      expect(message).not.toContain(unsafeValue);
      expect(message).not.toContain('secreto-no-real');
      expect(message).not.toContain('backend.interno.example');
    }
  });

  test('la variable no es NEXT_PUBLIC_: la dirección del backend no llega al navegador', () => {
    expect(API_URL_ENV_VAR).toBe('API_URL');
    expect(API_URL_ENV_VAR.startsWith('NEXT_PUBLIC_')).toBe(false);
  });
});
