import { describe, expect, test } from 'vitest';
import {
  hrefForExecutionsView,
  parseExecutionsView,
  withExecutionsView,
} from '@/lib/executions/view';

describe('parseExecutionsView', () => {
  test.each([
    [null, 'tarjetas'],
    [undefined, 'tarjetas'],
    ['', 'tarjetas'],
    ['tarjetas', 'tarjetas'],
    ['lista', 'lista'],
    ['LISTA', 'tarjetas'],
    ['mosaico', 'tarjetas'],
  ])('%s → %s', (value, expected) => {
    expect(parseExecutionsView(value)).toBe(expected);
  });
});

describe('withExecutionsView', () => {
  test('Tarjetas writes nothing', () => {
    expect(withExecutionsView('/ejecuciones/mi-actividad#para-retomar', 'tarjetas')).toBe(
      '/ejecuciones/mi-actividad#para-retomar',
    );
  });

  test('Lista goes before the fragment, and after a query', () => {
    expect(withExecutionsView('/ejecuciones/mi-actividad#para-retomar', 'lista')).toBe(
      '/ejecuciones/mi-actividad?vista=lista#para-retomar',
    );
    expect(withExecutionsView('/ejecuciones?x=1', 'lista')).toBe('/ejecuciones?x=1&vista=lista');
  });
});

describe('hrefForExecutionsView', () => {
  test('keeps the other parameters and only sets or takes out the view', () => {
    const params = new URLSearchParams('desde=2026-10-01&hasta=2026-10-27');

    expect(hrefForExecutionsView('/ejecuciones/mi-actividad', params, 'lista')).toBe(
      '/ejecuciones/mi-actividad?desde=2026-10-01&hasta=2026-10-27&vista=lista',
    );
    expect(
      hrefForExecutionsView('/ejecuciones', new URLSearchParams('vista=lista'), 'tarjetas'),
    ).toBe('/ejecuciones');
    expect(params.toString()).toBe('desde=2026-10-01&hasta=2026-10-27');
  });
});
