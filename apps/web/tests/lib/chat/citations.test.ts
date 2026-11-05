// Spec 009 (T11, F4, D14): las marcas [Sn] del texto, cruzadas por orden con las fuentes.
import { describe, expect, test } from 'vitest';
import { linkCitations } from '@/lib/chat/citations';

describe('linkCitations (spec 009)', () => {
  test('E15: [S2] y [S5] son las citas 1 y 2, en el orden de las fuentes', () => {
    expect(linkCitations('El plazo [S2] y el monto [S5].', 2)).toEqual([
      { type: 'text', text: 'El plazo ' },
      { type: 'cite', number: 1 },
      { type: 'text', text: ' y el monto ' },
      { type: 'cite', number: 2 },
      { type: 'text', text: '.' },
    ]);
  });

  test('el orden de las citas sale del número de la marca, no de dónde aparece', () => {
    expect(linkCitations('Primero [S5], después [S2].', 2)).toEqual([
      { type: 'text', text: 'Primero ' },
      { type: 'cite', number: 2 },
      { type: 'text', text: ', después ' },
      { type: 'cite', number: 1 },
      { type: 'text', text: '.' },
    ]);
  });

  test('una marca repetida es la misma cita', () => {
    expect(linkCitations('A [S1]. B [S1].', 1)).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'cite', number: 1 },
      { type: 'text', text: '. B ' },
      { type: 'cite', number: 1 },
      { type: 'text', text: '.' },
    ]);
  });

  test('sin marcas, solo texto', () => {
    expect(linkCitations('Sin marcas.', 3)).toEqual([{ type: 'text', text: 'Sin marcas.' }]);
  });

  test('si las marcas no coinciden con las fuentes, el texto queda sin marcas ni citas', () => {
    expect(linkCitations('Ver [S1] y [S9].', 1)).toEqual([{ type: 'text', text: 'Ver y.' }]);
  });
});
