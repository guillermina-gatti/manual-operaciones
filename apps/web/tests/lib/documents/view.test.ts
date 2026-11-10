import { describe, expect, test } from 'vitest';
import { hrefForView, parseViewParam, viewQuery, withView } from '@/lib/documents/view';

describe('parseViewParam', () => {
  test.each([
    [null, 'lista'],
    [undefined, 'lista'],
    ['', 'lista'],
    ['lista', 'lista'],
    ['xyz', 'lista'],
    ['TARJETAS', 'lista'],
    ['tarjetas', 'tarjetas'],
  ])('%s → %s', (value, expected) => {
    expect(parseViewParam(value)).toBe(expected);
  });
});

describe('direcciones con la vista', () => {
  test('la Lista no agrega nada; Tarjetas agrega vista=tarjetas', () => {
    expect(viewQuery('lista')).toBeUndefined();
    expect(viewQuery('tarjetas')).toBe('vista=tarjetas');
  });

  test('withView suma la vista con ? o &', () => {
    expect(withView('/documentos', 'lista')).toBe('/documentos');
    expect(withView('/documentos', 'tarjetas')).toBe('/documentos?vista=tarjetas');
    expect(withView('/documentos?q=caja', 'tarjetas')).toBe('/documentos?q=caja&vista=tarjetas');
  });

  test('hrefForView conserva la búsqueda y la página', () => {
    const params = new URLSearchParams('q=cierre de caja&pagina=2');

    expect(hrefForView('/documentos', params, 'tarjetas')).toBe(
      '/documentos?q=cierre+de+caja&pagina=2&vista=tarjetas',
    );
  });

  test('hrefForView a Lista saca el parámetro', () => {
    expect(hrefForView('/documentos', new URLSearchParams('vista=tarjetas'), 'lista')).toBe(
      '/documentos',
    );
    expect(
      hrefForView('/documentos', new URLSearchParams('q=caja&vista=tarjetas'), 'lista'),
    ).toBe('/documentos?q=caja');
  });
});
