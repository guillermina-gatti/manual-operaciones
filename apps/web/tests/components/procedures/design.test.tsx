import { describe, expect, test } from 'vitest';
import { areaTone } from '@/components/procedures/design';

// Spec 017, D4 (E2): cada área tiene siempre el mismo color, en la lista, la ficha y el editor.
describe('areaTone', () => {
  test('Ventas es durazno', () => {
    expect(areaTone('Ventas')).toContain('bg-durazno');
  });

  test('Operaciones es azul', () => {
    expect(areaTone('Operaciones')).toContain('bg-[#E3EDFC]');
    expect(areaTone('Operaciones')).toContain('text-[#1D4ED8]');
  });

  test('un mismo nombre da siempre el mismo color', () => {
    expect(areaTone('Compras')).toBe(areaTone('Compras'));
    expect(areaTone('Depósito')).toBe(areaTone('Depósito'));
  });

  test('cualquier otra área recibe uno de los tres colores: verde, durazno o azul', () => {
    const tones = new Set([areaTone('Ventas'), areaTone('Operaciones'), areaTone('zzz')]);
    const others = ['Compras', 'Depósito', 'Caja', 'Atención', 'Logística'].map(areaTone);

    others.forEach((tone) => expect(['bg-chip-area', 'bg-durazno', 'bg-[#E3EDFC]'].some((c) => tone.includes(c))).toBe(true));
    expect(tones.size).toBeGreaterThan(0);
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  test('no distingue mayúsculas ni espacios de los extremos', () => {
    expect(areaTone('  ventas ')).toBe(areaTone('Ventas'));
  });
});
