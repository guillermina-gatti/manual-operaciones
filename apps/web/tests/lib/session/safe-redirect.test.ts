import { describe, expect, test } from 'vitest';
import {
  DEFAULT_REDIRECT,
  buildLoginReturnUrl,
  sanitizeReturnTo,
} from '@/lib/session/safe-redirect';

describe('A-10b.1: safe-redirect / sanitizeReturnTo', () => {
  describe('destinos internos válidos', () => {
    test('permite una ruta interna simple', () => {
      expect(sanitizeReturnTo('/documentos')).toBe('/documentos');
      expect(sanitizeReturnTo('/documentos/nuevo')).toBe('/documentos/nuevo');
      expect(sanitizeReturnTo('/ejecuciones')).toBe('/ejecuciones');
      expect(sanitizeReturnTo('/metricas')).toBe('/metricas');
    });

    test('permite una ruta interna con query parameters', () => {
      expect(sanitizeReturnTo('/documentos?page=2&q=manual')).toBe(
        '/documentos?page=2&q=manual',
      );
      expect(sanitizeReturnTo('/ejecuciones/123?step=4')).toBe(
        '/ejecuciones/123?step=4',
      );
    });

    test('permite una ruta interna con hash / fragmento', () => {
      expect(sanitizeReturnTo('/documentos#seccion-1')).toBe(
        '/documentos#seccion-1',
      );
    });

    test('acepta un fallback personalizado cuando es una ruta interna válida', () => {
      expect(sanitizeReturnTo('invalido', '/ejecuciones')).toBe('/ejecuciones');
    });
  });

  describe('prevención de Open Redirect y destinos inseguros', () => {
    test('rechaza URLs externas absolutas con http o https', () => {
      expect(sanitizeReturnTo('https://evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('http://evil.com/phishing')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('https://evil.com/documentos')).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza URLs protocol-relative que comienzan con //', () => {
      expect(sanitizeReturnTo('//evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('//evil.com/documentos')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('///evil.com')).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza variantes con barras invertidas (evita bypass de WHATWG/navegadores)', () => {
      expect(sanitizeReturnTo('\\evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/\\evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('\\/evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/documentos\\malicioso')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/documentos/\\evil.com')).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza esquemas javascript, data y otros protocolos', () => {
      expect(sanitizeReturnTo('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('data:text/html,<script>alert(1)</script>')).toBe(
        DEFAULT_REDIRECT,
      );
      expect(sanitizeReturnTo('mailto:alguien@example.com')).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza rutas relativas que no comiencen con /', () => {
      expect(sanitizeReturnTo('documentos')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('documentos/nuevo')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('./documentos')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('../documentos')).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza cadenas con espacios en blanco o caracteres de control', () => {
      expect(sanitizeReturnTo('/ruta con espacios')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/documentos\x00malicioso')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/documentos\r\nHeader: Injection')).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza parámetros ausentes, nulos o vacíos', () => {
      expect(sanitizeReturnTo(null)).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('   ')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo(123)).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo({})).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo([])).toBe(DEFAULT_REDIRECT);
    });

    test('rechaza redirecciones redundantes a /login (con query, hash o barra final)', () => {
      expect(sanitizeReturnTo('/login')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/login?returnTo=/algo')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/login#seccion')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/login/')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/login///')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('/login/?returnTo=/algo#seccion')).toBe(DEFAULT_REDIRECT);
    });

    test('valida el fallback y rechaza fallbacks externos o maliciosos cayendo en DEFAULT_REDIRECT', () => {
      expect(sanitizeReturnTo(null, 'https://evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', '//evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', '/\\evil.com')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', 'javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', '/login')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', '/login#hash')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', '/login/')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', '')).toBe(DEFAULT_REDIRECT);
      expect(sanitizeReturnTo('invalido', 'ruta-relativa')).toBe(DEFAULT_REDIRECT);
    });
  });

  describe('buildLoginReturnUrl', () => {
    test('construye la URL de login con returnTo codificado', () => {
      expect(buildLoginReturnUrl('/documentos/nuevo')).toBe(
        '/login?returnTo=%2Fdocumentos%2Fnuevo',
      );
      expect(buildLoginReturnUrl('/ejecuciones')).toBe(
        '/login?returnTo=%2Fejecuciones',
      );
    });

    test('incluye searchParams de la ruta de origen', () => {
      const params = new URLSearchParams('area=ventas&filtro=1');
      expect(buildLoginReturnUrl('/documentos', params)).toBe(
        '/login?returnTo=%2Fdocumentos%3Farea%3Dventas%26filtro%3D1',
      );
    });

    test('no agrega returnTo redundante para /login, /login/ o /', () => {
      expect(buildLoginReturnUrl('/login')).toBe('/login');
      expect(buildLoginReturnUrl('/login/')).toBe('/login');
      expect(buildLoginReturnUrl('/')).toBe('/login');
    });

    test('retorna /login ante rutas nulas, vacías o inválidas', () => {
      expect(buildLoginReturnUrl(null)).toBe('/login');
      expect(buildLoginReturnUrl(undefined)).toBe('/login');
      expect(buildLoginReturnUrl('')).toBe('/login');
      expect(buildLoginReturnUrl('invalido')).toBe('/login');
    });
  });
});
