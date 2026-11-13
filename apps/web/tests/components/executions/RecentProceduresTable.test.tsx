import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RecentProceduresTable } from '@/components/executions/RecentProceduresTable';
import type { DocumentReference, MyProcedureMetrics } from '@/lib/api';
import { OPERACIONES, VENTAS, myMetricsResponse } from '../../support/my-metrics';

const AREAS = new Map<string, DocumentReference>([
  [VENTAS, { id: VENTAS, name: 'Ventas', isActive: true }],
  [OPERACIONES, { id: OPERACIONES, name: 'Operaciones', isActive: true }],
]);

const renderTable = (procedures: MyProcedureMetrics[] = myMetricsResponse().procedures) =>
  render(<RecentProceduresTable procedures={procedures} staleAfterHours={24} areas={AREAS} />);

const table = () => screen.getByRole('table', { name: 'Tus procedimientos recientes' });
const rowOf = (name: string) =>
  within(table()).getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;
// The cells of a row by their column: 0 started, 1 completed, 2 without progress, 3 average,
// 4 slowest step, 5 last time.
const cell = (name: string, index: number) => within(rowOf(name)).getAllByRole('cell')[index];

describe('the columns', () => {
  test('short labels, each with its full name', () => {
    renderTable();

    const headers = within(table())
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Procedimiento',
      'Empezadas',
      'Completadas',
      'Sin avanzar +24 hSin avanzar hace más de 24 horas',
      'Tiempo medio',
      'Paso que más te lleva',
      'Última vez',
    ]);
    // A screen reader hears the full name, not "+24 h".
    expect(
      within(table()).getByRole('columnheader', { name: 'Sin avanzar hace más de 24 horas' }),
    ).toHaveAttribute('scope', 'col');
  });

  test('fixed widths for the numbers, the free ones for the name and the step', () => {
    const { container } = renderTable();

    expect([...container.querySelectorAll('col')].map((col) => col.className)).toEqual([
      '',
      'w-[96px]',
      'w-[150px]',
      'w-[128px]',
      'w-[122px]',
      '',
      'w-[128px]',
    ]);
  });
});

describe('a row', () => {
  test('the name with its area chip', () => {
    renderTable();

    const header = within(table()).getByRole('rowheader', { name: /^Cierre de caja/ });
    expect(header).toHaveTextContent('Cierre de cajaVentas');
    expect(within(header).getByText('Ventas')).toHaveClass('bg-chip-area');
  });

  test('started, and completed as "N de M" with a decorative bar of its share', () => {
    renderTable();

    expect(cell('Cierre de caja', 0)).toHaveTextContent('4');
    expect(cell('Cierre de caja', 1)).toHaveTextContent(/^3 de 4 completadas$/);
    const bar = cell('Cierre de caja', 1).querySelector('[aria-hidden="true"]')!;
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('75%');
  });

  test('without progress: 0 muted, without a dot', () => {
    renderTable();

    const zero = within(cell('Cierre de caja', 2)).getByText('0');
    expect(zero).toHaveClass('text-texto-suave');
    expect(zero).not.toHaveClass('font-bold');
  });

  test('without progress: more than 0 in bold, the alert color and a dot (not only color)', () => {
    renderTable();

    const one = within(cell('Recepción de mercadería', 2)).getByText('1');
    expect(one).toHaveClass('font-bold', 'text-durazno-texto');
    expect(one.querySelector('[aria-hidden="true"]')).toHaveClass('rounded-full');
  });

  test('the average in bold; without completed ones, a dash', () => {
    renderTable();

    expect(within(cell('Cierre de caja', 3)).getByText('10 min')).toHaveClass('text-lg', 'font-bold');
    expect(within(cell('Recepción de mercadería', 3)).getByText('—')).toBeInTheDocument();
  });

  test('the slowest step with its time in a tag that does not wrap', () => {
    renderTable();

    expect(cell('Cierre de caja', 4)).toHaveTextContent(
      'Se traba en: Paso 2: Comparar con el reporte4 min',
    );
    expect(within(cell('Cierre de caja', 4)).getByText('4 min')).toHaveClass('whitespace-nowrap');
    expect(cell('Recepción de mercadería', 4)).toHaveTextContent('Se traba en: —');
  });

  test('the last time: the day and, apart, the time', () => {
    renderTable();

    const time = within(cell('Cierre de caja', 5)).getByText('27 oct 2026').closest('time')!;
    expect(time).toHaveAttribute('dateTime', '2026-10-27T12:50:00.000Z');
    expect(within(time).getByText('09:50')).toHaveClass('text-texto-suave');
  });
});

describe('the card on the phone', () => {
  test('the words only the card needs are hidden from lg', () => {
    renderTable();

    for (const text of ['Tiempo medio', 'Se traba en:', 'Última vez:']) {
      expect(within(rowOf('Cierre de caja')).getByText(text, { exact: false })).toHaveClass(
        'lg:hidden',
      );
    }
    expect(within(cell('Cierre de caja', 1)).getByText('completadas', { exact: false })).toHaveClass(
      'lg:hidden',
    );
  });

  test('the row becomes a two-column card; started is said by "de M" and is not repeated', () => {
    renderTable();

    expect(rowOf('Cierre de caja')).toHaveClass('max-lg:grid', 'max-lg:grid-cols-2');
    expect(cell('Cierre de caja', 0)).toHaveClass('max-lg:hidden');
    // The average and "sin avanzar" side by side; the step and the last time below, across.
    expect(cell('Cierre de caja', 2)).toHaveClass('max-lg:order-1');
    expect(cell('Cierre de caja', 4)).toHaveClass('col-span-2', 'max-lg:order-2');
    expect(cell('Cierre de caja', 5)).toHaveClass('col-span-2', 'max-lg:order-3');
  });
});

describe('sorting by column', () => {
  const [base] = myMetricsResponse().procedures;
  const make = (
    n: number,
    title: string,
    counts: { started: number; completed: number; abandoned: number },
    avgCompletionMs: number | null,
    lastStartedAt: string,
  ): MyProcedureMetrics => ({
    ...base,
    procedureId: `1a000000-0000-4000-8000-00000000009${n}`,
    title,
    ...counts,
    inProgress: counts.started - counts.completed - counts.abandoned,
    avgCompletionMs,
    lastStartedAt,
  });
  // The order of the API: the most recent first.
  const PROCEDURES = [
    make(1, 'Cierre de caja', { started: 12, completed: 11, abandoned: 0 }, 1_140_000, '2026-11-13T12:50:00.000Z'),
    make(2, 'Recepción de mercadería', { started: 9, completed: 8, abandoned: 1 }, 2_700_000, '2026-11-11T14:00:00.000Z'),
    make(3, 'Inventario', { started: 2, completed: 0, abandoned: 2 }, null, '2026-11-10T11:05:00.000Z'),
    make(4, 'Apertura del local', { started: 6, completed: 6, abandoned: 0 }, 380_000, '2026-11-12T11:05:00.000Z'),
  ];
  const order = () =>
    within(table())
      .getAllByRole('rowheader')
      .map((header) => header.querySelector('span')!.textContent);
  const header = (name: string) =>
    within(table()).getByRole('columnheader', { name: new RegExp(`^${name}`) });
  const DEFAULT = ['Cierre de caja', 'Recepción de mercadería', 'Inventario', 'Apertura del local'];

  test('by default, as the API gives them; the slowest step does not sort', () => {
    renderTable(PROCEDURES);

    expect(order()).toEqual(DEFAULT);
    expect(within(header('Paso que más te lleva')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(header('Sin avanzar hace más de 24 horas')).getByRole('button')).toBeInTheDocument();
  });

  test('the last time: most recent first, then oldest, then the default', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);
    const last = within(header('Última vez')).getByRole('button');

    await user.click(last);
    expect(header('Última vez')).toHaveAttribute('aria-sort', 'descending');
    expect(order()).toEqual(['Cierre de caja', 'Apertura del local', 'Recepción de mercadería', 'Inventario']);
    await user.click(last);
    expect(order()).toEqual(['Inventario', 'Recepción de mercadería', 'Apertura del local', 'Cierre de caja']);
    await user.click(last);
    expect(order()).toEqual(DEFAULT);
  });

  test('the average time by its value, the one without a time last', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    await user.click(within(header('Tiempo medio')).getByRole('button'));
    await user.click(within(header('Tiempo medio')).getByRole('button'));
    expect(header('Tiempo medio')).toHaveAttribute('aria-sort', 'ascending');
    expect(order()).toEqual(['Apertura del local', 'Cierre de caja', 'Recepción de mercadería', 'Inventario']);
  });

  test('without progress and started, from more to less', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    await user.click(within(header('Sin avanzar hace más de 24 horas')).getByRole('button'));
    expect(order().slice(0, 2)).toEqual(['Inventario', 'Recepción de mercadería']);
    await user.click(within(header('Empezadas')).getByRole('button'));
    expect(order()).toEqual(['Cierre de caja', 'Recepción de mercadería', 'Apertura del local', 'Inventario']);
  });

  test('on a phone, the selector, with the default "Más reciente primero"', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    const select = screen.getByRole('combobox', { name: 'Ordenar por' });
    expect(select).toHaveDisplayValue('Más reciente primero (por defecto)');
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('Última vez (más vieja primero)');
    expect(options).toContain('Completadas (mayor a menor)');
    expect(options.some((option) => option?.startsWith('Paso'))).toBe(false);

    await user.selectOptions(select, 'Procedimiento (A → Z)');
    expect(order()).toEqual(['Apertura del local', 'Cierre de caja', 'Inventario', 'Recepción de mercadería']);
  });
});
