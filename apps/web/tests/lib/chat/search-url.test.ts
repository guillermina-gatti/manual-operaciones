// Spec 009 (T11, R8): el enlace a la búsqueda sin IA. Es la misma tabla que la API
// (apps/api/src/chat/chat-search-url.spec.ts): si cambia una, cambia la otra.
import { describe, expect, test } from 'vitest';
import { buildSearchUrl } from '@/lib/chat/search-url';

const LONG_WITH_SPACES = Array.from({ length: 300 }, (_, i) => `palabra${i}`).join(' ');

describe('buildSearchUrl (spec 009, R8)', () => {
  test.each([
    ['¿Cómo cierro la caja?', '/documentos?q=%C2%BFC%C3%B3mo%20cierro%20la%20caja%3F'],
    ['  caja \n diaria  ', '/documentos?q=caja%20diaria'],
    ['ok', '/documentos'],
    ['  a  ', '/documentos'],
    ['a&b #1', '/documentos?q=a%26b%20%231'],
    ['abc', '/documentos?q=abc'],
  ])('%j → %s', (question, url) => {
    expect(buildSearchUrl(question)).toBe(url);
  });

  test('E12: una pregunta larga con espacios se corta en un espacio, con 100 caracteres como mucho', () => {
    const text = decodeURIComponent(buildSearchUrl(LONG_WITH_SPACES).replace('/documentos?q=', ''));

    expect(text.length).toBeLessThanOrEqual(100);
    expect(LONG_WITH_SPACES.startsWith(`${text} `)).toBe(true);
  });

  test('150 caracteres sin espacios quedan en los primeros 100', () => {
    expect(buildSearchUrl('x'.repeat(150))).toBe(`/documentos?q=${'x'.repeat(100)}`);
  });

  test('exactamente 100 caracteres no se corta', () => {
    const question = `${'a'.repeat(49)} ${'b'.repeat(50)}`;

    expect(buildSearchUrl(question)).toBe(`/documentos?q=${encodeURIComponent(question)}`);
  });
});
