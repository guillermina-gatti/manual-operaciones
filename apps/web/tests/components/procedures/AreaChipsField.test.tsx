import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { AreaChipsField } from '@/components/procedures/AreaChipsField';
import { AREAS } from '../../support/procedure-areas';
import { OPERACIONES, VENTAS } from '../../support/procedures';

const ARCHIVO = AREAS[0].id;

function setup(selected: string[]) {
  const onChange = vi.fn();
  render(<AreaChipsField areas={AREAS} selected={selected} onChange={onChange} />);
  return { onChange };
}

describe('AreaChipsField (spec 015, D22 and D26)', () => {
  test('is a group named "Áreas" with a chip for each active area', () => {
    setup([]);

    expect(screen.getByRole('group', { name: 'Áreas' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Operaciones' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ventas' })).not.toBeChecked();
  });

  test('the areas of the procedure are marked', () => {
    setup([OPERACIONES]);

    expect(screen.getByRole('checkbox', { name: 'Operaciones' })).toBeChecked();
  });

  test('an inactive area the procedure has is shown with "(inactiva)"', () => {
    setup([ARCHIVO]);

    expect(screen.getByRole('checkbox', { name: 'Archivo (inactiva)' })).toBeChecked();
  });

  test('an inactive area the procedure does not have is not offered', () => {
    setup([]);

    expect(screen.queryByRole('checkbox', { name: /Archivo/ })).not.toBeInTheDocument();
  });

  test('marking a chip gives the new list in the order of the areas, not of the clicks', async () => {
    const { onChange } = setup([VENTAS]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Operaciones' }));

    expect(onChange).toHaveBeenCalledWith([OPERACIONES, VENTAS]);
  });

  test('unmarking a chip takes it off the list', async () => {
    const { onChange } = setup([OPERACIONES, VENTAS]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Ventas' }));

    expect(onChange).toHaveBeenCalledWith([OPERACIONES]);
  });
});
