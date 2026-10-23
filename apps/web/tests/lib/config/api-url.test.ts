import { describe, expect, test } from 'vitest';
import {
  API_URL_ENV_VAR,
  DEFAULT_DEV_API_URL,
  resolveApiUrl,
} from '@/lib/config/api-url';

describe('resolveApiUrl', () => {
  test('con API_URL definida devuelve ese valor sin la barra final', () => {
    expect(
      resolveApiUrl({ NODE_ENV: 'production', API_URL: 'https://api.ejemplo.com/' }),
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
    expect(() => resolveApiUrl({ NODE_ENV: 'production' })).toThrow(
      /API_URL/,
    );
  });

  test('la variable no es NEXT_PUBLIC_: la dirección del backend no llega al navegador', () => {
    expect(API_URL_ENV_VAR).toBe('API_URL');
    expect(API_URL_ENV_VAR.startsWith('NEXT_PUBLIC_')).toBe(false);
  });
});
