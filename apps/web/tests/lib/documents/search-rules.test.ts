import { describe, expect, test } from 'vitest';
import { SEARCH_MAX, SEARCH_MIN, parseSearchParam } from '@/lib/documents/search-rules';

describe('parseSearchParam (spec 004, R4 y F2)', () => {
  test('los límites son los de la API: de 3 a 100 caracteres', () => {
    expect(SEARCH_MIN).toBe(3);
    expect(SEARCH_MAX).toBe(100);
  });

  test.each([null, undefined, ''])('%j no es una búsqueda', (value) => {
    expect(parseSearchParam(value)).toEqual({ kind: 'none' });
  });

  test('solo espacios: no es una búsqueda', () => {
    expect(parseSearchParam('   ')).toEqual({ kind: 'none' });
  });

  test('menos de 3 caracteres sin los espacios de los extremos: inválida', () => {
    expect(parseSearchParam('  ca ')).toEqual({ kind: 'invalid', text: 'ca' });
  });

  test('3 caracteres o más: válida, recortada', () => {
    expect(parseSearchParam(' caja ')).toEqual({ kind: 'valid', text: 'caja' });
    expect(parseSearchParam('caj')).toEqual({ kind: 'valid', text: 'caj' });
  });

  test('100 caracteres es válida; 101 no', () => {
    expect(parseSearchParam('a'.repeat(100))).toEqual({ kind: 'valid', text: 'a'.repeat(100) });
    expect(parseSearchParam('a'.repeat(101))).toEqual({ kind: 'invalid', text: 'a'.repeat(101) });
  });

  test('los caracteres especiales se conservan tal cual', () => {
    expect(parseSearchParam('caja & | ! :')).toEqual({ kind: 'valid', text: 'caja & | ! :' });
  });
});
