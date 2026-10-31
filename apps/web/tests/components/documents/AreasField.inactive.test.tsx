import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AreasField } from '@/components/documents/AreasField';
import type { Area } from '@/lib/directory';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const AREAS: Area[] = [
  { id: VENTAS, name: 'Ventas', isActive: true },
  { id: OPERACIONES, name: 'Operaciones', isActive: false },
];

describe('T28: selección de áreas con histórico', () => {
  test('en una asignación nueva muestra solo las áreas activas', () => {
    const onChange = vi.fn();
    render(<AreasField areas={AREAS} selected={[]} onChange={onChange} />);

    expect(screen.getByRole('checkbox', { name: 'Ventas' })).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Operaciones (inactiva)' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ventas' }));
    expect(onChange).toHaveBeenCalledWith([VENTAS]);
  });

  test('conserva el área histórica o permite quitarla, pero nunca agregarla otra vez', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AreasField areas={AREAS} selected={[OPERACIONES]} onChange={onChange} />);

    const historic = screen.getByRole('checkbox', { name: 'Operaciones (inactiva)' });
    expect(historic).toBeChecked();
    expect(historic).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ventas' }));
    expect(onChange).toHaveBeenCalledWith([VENTAS, OPERACIONES]);

    rerender(<AreasField areas={AREAS} selected={[VENTAS, OPERACIONES]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Operaciones (inactiva)' }));
    expect(onChange).toHaveBeenLastCalledWith([VENTAS]);

    rerender(<AreasField areas={AREAS} selected={[VENTAS]} onChange={onChange} />);
    expect(screen.queryByRole('checkbox', { name: 'Operaciones (inactiva)' })).toBeNull();
  });
});
