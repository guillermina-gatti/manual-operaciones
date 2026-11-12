// Spec 008 (T08): cómo se muestran las personas y las áreas que trae la respuesta (F2, F3).
import { describe, expect, test } from 'vitest';
import { formatArea, formatAreas, formatPerson } from '@/lib/documents/format';

const ANA = { id: 'ana', name: 'Ana Pérez', isActive: true };
const VENTAS = { id: 'ventas', name: 'Ventas', isActive: true };
const COMPRAS = { id: 'compras', name: 'Compras', isActive: false };

describe('formatPerson', () => {
  test('activa: solo el nombre', () => {
    expect(formatPerson(ANA)).toBe('Ana Pérez');
  });

  test('inactiva: con "(inactivo)" (F2)', () => {
    expect(formatPerson({ ...ANA, isActive: false })).toBe('Ana Pérez (inactivo)');
  });

  test('sin nombre: "—", sin "(inactivo)" (F3)', () => {
    expect(formatPerson({ id: 'x', name: null, isActive: false })).toBe('—');
  });

  test('sin referencia: "—"', () => {
    expect(formatPerson(null)).toBe('—');
    expect(formatPerson(undefined)).toBe('—');
  });
});

describe('formatArea y formatAreas', () => {
  test('activa e inactiva', () => {
    expect(formatArea(VENTAS)).toBe('Ventas');
    expect(formatArea(COMPRAS)).toBe('Compras (inactiva)');
  });

  test('sin nombre: "—"', () => {
    expect(formatArea({ id: 'x', name: null, isActive: false })).toBe('—');
  });

  test('varias, separadas por coma, en el orden recibido', () => {
    expect(formatAreas([VENTAS, COMPRAS])).toBe('Ventas, Compras (inactiva)');
  });

  test('ninguna: "—"', () => {
    expect(formatAreas([])).toBe('—');
  });
});
