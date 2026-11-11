import { describe, expect, test } from 'vitest';
import { suggestTitle } from '@/lib/documents/suggest-title';

describe('suggestTitle', () => {
  test.each([
    ['manual-de-caja.pdf', 'Manual de caja'],
    ['procedimiento_de_cierre.txt', 'Procedimiento de cierre'],
    ['Notas.de.reunión.md', 'Notas de reunión'],
    ['  guía   --  rápida .pdf', 'Guía rápida'],
    ['ñandú.pdf', 'Ñandú'],
    ['sin-extension', 'Sin extension'],
    ['.pdf', 'Pdf'],
    ['---.pdf', ''],
  ])('%s → "%s"', (fileName, title) => {
    expect(suggestTitle(fileName)).toBe(title);
  });

  test('corta en 200 caracteres, como el límite del título', () => {
    expect(suggestTitle(`${'a'.repeat(250)}.pdf`)).toHaveLength(200);
  });
});
