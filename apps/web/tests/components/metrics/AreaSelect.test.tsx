import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AreaSelect } from '@/components/metrics/AreaSelect';
import type { AreaOption } from '@/lib/metrics/filters';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const LOGISTICA = '0a000000-0000-4000-8000-000000000003';

const OPTIONS: AreaOption[] = [
  { value: '', label: 'Todas las áreas', hint: '3 áreas' },
  { value: VENTAS, label: 'Ventas', hint: '2 procedimientos' },
  { value: OPERACIONES, label: 'Operaciones', hint: '1 procedimiento' },
  { value: LOGISTICA, label: 'Logística', hint: 'Sin datos' },
];

// Controlled like the filters form does it.
function Harness({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <AreaSelect
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <button type="button">Afuera</button>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: /^Área/ });
const search = () => screen.getByRole('combobox', { name: 'Buscar área' });
const list = () => screen.queryByRole('listbox', { name: 'Área' });
const names = () =>
  within(list()!)
    .getAllByRole('option')
    .map((option) => option.querySelector('span')?.textContent);

describe('AreaSelect', () => {
  test('closed, shows the chosen area and, for "Todas", how many areas there are', () => {
    render(<Harness />);

    expect(trigger()).toHaveTextContent('Todas las áreas');
    expect(trigger()).toHaveTextContent('3 áreas');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(list()).not.toBeInTheDocument();
  });

  test('opens with the search box focused and every option with its hint', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(search()).toHaveFocus();
    expect(search()).toHaveAttribute('placeholder', 'Buscar área…');
    expect(names()).toEqual(['Todas las áreas', 'Ventas', 'Operaciones', 'Logística']);
    expect(screen.getByRole('option', { name: /^Logística/ })).toHaveTextContent('Sin datos');
  });

  test('the chosen option is marked with aria-selected, not only a color', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    expect(screen.getByRole('option', { name: /^Todas las áreas/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: /^Ventas/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  test('searches by any part of the name, without case or accents', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.type(search(), 'LOGIST');

    expect(names()).toEqual(['Logística']);
  });

  test('a search without matches says so', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.type(search(), 'Marketing');

    expect(within(list()!).queryAllByRole('option')).toEqual([]);
    expect(screen.getByText('No hay áreas con ese nombre.')).toBeInTheDocument();
  });

  test('choosing an option closes the list and changes the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: /^Operaciones/ }));

    expect(onChange).toHaveBeenCalledWith(OPERACIONES);
    expect(list()).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Operaciones');
    // The area count is only shown for "Todas".
    expect(trigger()).not.toHaveTextContent('1 procedimiento');
    expect(trigger()).toHaveFocus();
  });

  test('the arrows move through the list and Enter chooses', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(trigger());
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(search()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /^Operaciones/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(OPERACIONES);
    expect(list()).not.toBeInTheDocument();
  });

  test('Escape closes and clears the search', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(trigger());
    await user.type(search(), 'vent');
    await user.keyboard('{Escape}');

    expect(list()).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();

    await user.click(trigger());
    expect(search()).toHaveValue('');
    expect(names()).toHaveLength(4);
  });

  test('a click outside closes the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Afuera' }));

    expect(list()).not.toBeInTheDocument();
  });
});
