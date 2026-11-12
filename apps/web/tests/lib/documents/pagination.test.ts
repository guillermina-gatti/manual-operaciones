import { describe, expect, test } from 'vitest';
import { pageCount, pageNumbers, parsePageParam } from '@/lib/documents/pagination';

describe('pageNumbers (F7, P6)', () => {
  test.each([
    [1, 1, [1]],
    [6, 12, [1, '…', 5, 6, 7, '…', 12]],
    [1, 12, [1, 2, '…', 12]],
    [12, 12, [1, '…', 11, 12]],
    [2, 3, [1, 2, 3]],
    [3, 5, [1, 2, 3, 4, 5]],
  ])('pageNumbers(%i, %i) da %j', (current, total, expected) => {
    expect(pageNumbers(current, total)).toEqual(expected);
  });

  test('un "…" que escondería una sola página se reemplaza por el número', () => {
    // Entre 1 y 3 falta solo la 2: se muestra la 2, no "…".
    expect(pageNumbers(4, 12)).toEqual([1, 2, 3, 4, 5, '…', 12]);
    expect(pageNumbers(9, 12)).toEqual([1, '…', 8, 9, 10, 11, 12]);
  });

  test('sin páginas no hay números', () => {
    expect(pageNumbers(1, 0)).toEqual([]);
  });

  test('una página actual fuera de rango se acomoda al rango', () => {
    expect(pageNumbers(20, 12)).toEqual([1, '…', 11, 12]);
  });
});

describe('pageCount', () => {
  test.each([
    [0, 20, 0],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [45, 20, 3],
  ])('%i documentos de a %i son %i páginas', (total, pageSize, expected) => {
    expect(pageCount(total, pageSize)).toBe(expected);
  });
});

describe('parsePageParam', () => {
  test.each([null, undefined, '', 'abc', '0', '-2', '1.5', ' 3', '3a', '1e3', '99999999999999999999'])(
    '%j da 1',
    (value) => {
      expect(parsePageParam(value)).toBe(1);
    },
  );

  test('un entero desde 1 se usa tal cual', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam('1')).toBe(1);
    expect(parsePageParam('03')).toBe(3);
  });
});
