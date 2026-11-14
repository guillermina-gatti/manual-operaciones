import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { ProcedureTimeTable } from '@/components/metrics/ProcedureTimeTable';
import { DATA_CELL } from '@/components/metrics/metrics-design';
import type { DocumentReference, ProcedureMetricsResponse } from '@/lib/api';
import { CIERRE_DE_CAJA, OPERACIONES, VENTAS, metricsResponse } from '../../support/metrics';

const AREAS = new Map<string, DocumentReference>([
  [VENTAS, { id: VENTAS, name: 'Ventas', isActive: true }],
  [OPERACIONES, { id: OPERACIONES, name: 'Operaciones', isActive: false }],
]);
const UNKNOWN = '5d2f6a10-8c3e-4f3a-9c2b-4f3a9c2b81de';

const renderTable = (procedures: ProcedureMetricsResponse[] = metricsResponse().procedures) =>
  render(<ProcedureTimeTable procedures={procedures} areas={AREAS} />);

const table = () => screen.getByRole('table', { name: 'Tiempo por procedimiento' });
const rowOf = (name: string) =>
  within(table()).getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;
// The cells of a row by their column: 0 completed, 1 average, 2 fastest, 3 slowest, 4 step.
const cell = (name: string, index: number) => within(rowOf(name)).getAllByRole('cell')[index];
// What a cell says without the words only the card shows.
const value = (element: HTMLElement) => {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.lg\\:hidden').forEach((label) => label.remove());
  return copy.textContent?.replace(/\s/g, ' ');
};

describe('the section', () => {
  test('its title, with the orange mark, and what it measures', () => {
    renderTable();

    const heading = screen.getByRole('heading', { level: 2, name: 'Tiempo por procedimiento' });
    expect(heading.querySelector('[aria-hidden="true"]')).toHaveClass('w-1', 'bg-naranja');
    expect(
      screen.getByText(
        'Cuánto tarda una ejecución completa, de inicio a fin. Ordenado de mayor a menor tiempo medio.',
      ),
    ).toBeInTheDocument();
  });

  test('without procedures says there are no executions', () => {
    renderTable([]);

    expect(screen.getByText('No hay ejecuciones en este período.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('the columns', () => {
  test('in this order, in capitals, with fixed widths for the numbers', () => {
    const { container } = renderTable();

    const headers = within(table()).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Procedimiento',
      'Completadas',
      'Tiempo medio total',
      'Más rápida',
      'Más lenta',
      'Paso que más tarda',
    ]);
    for (const header of headers) expect(header).toHaveClass('uppercase', 'text-left');
    expect([...container.querySelectorAll('col')].map((col) => col.className)).toEqual([
      '',
      'w-[130px]',
      'w-[190px]',
      'w-[120px]',
      'w-[120px]',
      '',
    ]);
  });

  test('every data cell is aligned the same way: to the left, with tabular numbers', () => {
    renderTable();

    const cells = within(table()).getAllByRole('cell');
    expect(cells).toHaveLength(10);
    for (const data of cells) {
      expect(data.className).toContain(DATA_CELL);
      expect(data).toHaveClass('text-left', 'tabular-nums');
      expect(data).not.toHaveClass('text-right');
    }
  });
});

describe('a row', () => {
  test('slowest first, with its areas as chips, its extremes and its slowest step', () => {
    renderTable();

    const names = within(table())
      .getAllByRole('rowheader')
      .map((header) => header.textContent);
    expect(names).toEqual(['Cierre de cajaVentas', 'Recepción de mercaderíaOperaciones (inactiva)']);
    expect(within(rowOf('Cierre de caja')).getByText('Ventas')).toHaveClass('bg-chip-area');
    expect(within(rowOf('Cierre de caja')).getAllByRole('cell').map(value)).toEqual([
      '2',
      '12 min',
      '10 min',
      '14 min',
      'Comparar con el reporte3 min 20 s',
    ]);
  });

  test('the name in bold 17 px; the average in bold 17 px', () => {
    renderTable();

    expect(within(rowOf('Cierre de caja')).getByText('Cierre de caja')).toHaveClass(
      'text-[17px]',
      'font-bold',
    );
    expect(within(cell('Cierre de caja', 1)).getByText('12 min')).toHaveClass(
      'text-[17px]',
      'font-bold',
    );
  });

  test('the bar of the slowest row is orange; the others green, of their share of the slowest', () => {
    renderTable();

    const fill = (name: string) =>
      within(cell(name, 1)).getByTestId('time-bar').firstElementChild as HTMLElement;
    expect(within(cell('Cierre de caja', 1)).getByTestId('time-bar')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(fill('Cierre de caja')).toHaveClass('bg-naranja');
    expect(fill('Cierre de caja').style.width).toBe('100%');
    expect(fill('Recepción de mercadería')).toHaveClass('bg-[#1B9B5B]');
    // 5 min of 12 min.
    expect(fill('Recepción de mercadería').style.width).toBe(`${(300000 / 720000) * 100}%`);
  });

  test('a very short time still shows 3 % of bar', () => {
    const [cierre, recepcion] = metricsResponse().procedures;
    renderTable([cierre, { ...recepcion, avgCompletionMs: 1000 }]);

    const fill = within(cell('Recepción de mercadería', 1)).getByTestId('time-bar')
      .firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('3%');
  });

  test('the time of the slowest step in a tag that does not wrap', () => {
    renderTable();

    expect(within(cell('Cierre de caja', 4)).getByText('3 min 20 s')).toHaveClass(
      'whitespace-nowrap',
      'bg-[#FDEBE2]',
      'text-[#8A3410]',
    );
  });

  test('without completed executions: the times and the step are "—", and no bar', () => {
    const [cierre] = metricsResponse().procedures;
    renderTable([
      {
        ...cierre,
        completed: 0,
        avgCompletionMs: null,
        minCompletionMs: null,
        maxCompletionMs: null,
        versions: [{ ...cierre.versions[0], steps: [] }],
      },
    ]);

    expect(within(rowOf('Cierre de caja')).getAllByRole('cell').map(value)).toEqual([
      '0',
      '—',
      '—',
      '—',
      '—',
    ]);
    expect(screen.queryByTestId('time-bar')).not.toBeInTheDocument();
  });

  test('a procedure that is not a sample one shows a distinguishable name, never its id', () => {
    const [cierre] = metricsResponse().procedures;
    renderTable([{ ...cierre, procedureId: UNKNOWN }]);

    expect(within(table()).getByRole('rowheader')).toHaveTextContent('Procedimiento 2B81DE');
    expect(document.body.textContent).not.toContain(UNKNOWN);
    expect(document.body.textContent).not.toContain(CIERRE_DE_CAJA);
  });
});

describe('the card on the phone', () => {
  test('the row becomes a two-column card; fastest and slowest side by side', () => {
    renderTable();

    expect(rowOf('Cierre de caja')).toHaveClass('max-lg:grid', 'max-lg:grid-cols-2');
    for (const index of [0, 1, 4]) expect(cell('Cierre de caja', index)).toHaveClass('col-span-2');
    for (const index of [2, 3]) expect(cell('Cierre de caja', index)).not.toHaveClass('col-span-2');
  });

  test('each datum has its name on the card, hidden from lg', () => {
    renderTable();

    const labels = within(rowOf('Cierre de caja'))
      .getAllByRole('cell')
      .map((data) => data.querySelector('.lg\\:hidden')?.textContent);
    expect(labels).toEqual([
      'Completadas',
      'Tiempo medio total',
      'Más rápida',
      'Más lenta',
      'Paso que más tarda',
    ]);
  });
});

describe('sorting by column', () => {
  const [base] = metricsResponse().procedures;
  const make = (
    n: number,
    title: string,
    completed: number,
    avg: number | null,
    min: number | null,
    max: number | null,
  ): ProcedureMetricsResponse => ({
    ...base,
    procedureId: `1a000000-0000-4000-8000-00000000009${n}`,
    title,
    completed,
    avgCompletionMs: avg,
    minCompletionMs: min,
    maxCompletionMs: max,
  });
  // Recepción takes hours, Apertura seconds: as text "8 s" would go before "11 h 54 min".
  const PROCEDURES = [
    make(1, 'Cierre de caja', 12, 1_140_000, 720_000, 1_680_000),
    make(2, 'Recepción de mercadería', 7, 42_840_000, 1_800_000, 80_000_000),
    make(3, 'Inventario mensual', 0, null, null, null),
    make(4, 'Apertura del local', 8, 8_000, 5_000, 12_000),
    make(5, 'Devolución', 3, 1_140_000, 600_000, 1_200_000),
  ];
  const order = () =>
    within(table())
      .getAllByRole('rowheader')
      .map((header) => header.querySelector('span')!.textContent);
  const header = (name: string) => within(table()).getByRole('columnheader', { name: new RegExp(`^${name}`) });
  const button = (name: string) => within(header(name)).getByRole('button');
  const DEFAULT = [
    'Recepción de mercadería',
    'Cierre de caja',
    'Devolución',
    'Apertura del local',
    'Inventario mensual',
  ];

  test('by default, the slowest average first; every header but the slowest step sorts', () => {
    renderTable(PROCEDURES);

    expect(order()).toEqual(DEFAULT);
    for (const name of ['Procedimiento', 'Completadas', 'Tiempo medio total', 'Más rápida', 'Más lenta']) {
      expect(header(name)).toHaveAttribute('aria-sort', 'none');
      expect(button(name)).toBeInTheDocument();
    }
    expect(within(header('Paso que más tarda')).queryByRole('button')).not.toBeInTheDocument();
    expect(header('Paso que más tarda')).not.toHaveAttribute('aria-sort');
  });

  test('a number: descending, then ascending, then the default; the nulls always last', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    await user.click(button('Más rápida'));
    expect(header('Más rápida')).toHaveAttribute('aria-sort', 'descending');
    expect(order()).toEqual([
      'Recepción de mercadería',
      'Cierre de caja',
      'Devolución',
      'Apertura del local',
      'Inventario mensual',
    ]);
    expect(within(header('Más rápida')).getByTestId('sort-arrow')).toHaveTextContent('▼');
    expect(within(header('Más rápida')).getByTestId('sort-arrow')).toHaveAttribute('aria-hidden', 'true');

    await user.click(button('Más rápida'));
    expect(header('Más rápida')).toHaveAttribute('aria-sort', 'ascending');
    expect(order()).toEqual([
      'Apertura del local',
      'Devolución',
      'Cierre de caja',
      'Recepción de mercadería',
      'Inventario mensual',
    ]);
    expect(within(header('Más rápida')).getByTestId('sort-arrow')).toHaveTextContent('▲');

    await user.click(button('Más rápida'));
    expect(header('Más rápida')).toHaveAttribute('aria-sort', 'none');
    expect(order()).toEqual(DEFAULT);
  });

  test('the average by its milliseconds, a tie by name; the other arrows go away', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    await user.click(button('Tiempo medio total'));
    await user.click(button('Tiempo medio total'));
    expect(order()).toEqual([
      'Apertura del local',
      'Cierre de caja',
      'Devolución',
      'Recepción de mercadería',
      'Inventario mensual',
    ]);
    await user.click(button('Completadas'));
    expect(order()).toEqual([
      'Cierre de caja',
      'Apertura del local',
      'Recepción de mercadería',
      'Devolución',
      'Inventario mensual',
    ]);
    expect(header('Tiempo medio total')).toHaveAttribute('aria-sort', 'none');
    expect(within(header('Tiempo medio total')).getByTestId('sort-arrow')).toHaveTextContent('');
  });

  test('the slowest keeps its orange bar in any order', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    await user.click(button('Procedimiento'));
    expect(order()[0]).toBe('Apertura del local');
    const slowest = within(rowOf('Recepción de mercadería')).getByTestId('time-bar');
    expect(slowest.firstElementChild).toHaveClass('bg-naranja');
    expect(within(rowOf('Apertura del local')).getByTestId('time-bar').firstElementChild).not.toHaveClass('bg-naranja');
  });

  test('the name: A → Z first, then Z → A', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    await user.click(button('Procedimiento'));
    expect(header('Procedimiento')).toHaveAttribute('aria-sort', 'ascending');
    expect(order()).toEqual([
      'Apertura del local',
      'Cierre de caja',
      'Devolución',
      'Inventario mensual',
      'Recepción de mercadería',
    ]);
    await user.click(button('Procedimiento'));
    expect(order()[0]).toBe('Recepción de mercadería');
  });

  test('with the keyboard: Enter and Space on the header', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    button('Más lenta').focus();
    await user.keyboard('{Enter}');
    expect(header('Más lenta')).toHaveAttribute('aria-sort', 'descending');
    await user.keyboard(' ');
    expect(header('Más lenta')).toHaveAttribute('aria-sort', 'ascending');
    expect(button('Más lenta')).toHaveFocus();
  });

  test('on a phone, a native selector with the same orders, above the cards', async () => {
    const user = userEvent.setup();
    renderTable(PROCEDURES);

    const select = screen.getByRole('combobox', { name: 'Ordenar por' });
    expect(select.closest('div')).toHaveClass('lg:hidden');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Mayor tiempo medio primero (por defecto)',
      'Procedimiento (A → Z)',
      'Procedimiento (Z → A)',
      'Completadas (mayor a menor)',
      'Completadas (menor a mayor)',
      'Tiempo medio total (mayor a menor)',
      'Tiempo medio total (menor a mayor)',
      'Más rápida (mayor a menor)',
      'Más rápida (menor a mayor)',
      'Más lenta (mayor a menor)',
      'Más lenta (menor a mayor)',
    ]);

    await user.selectOptions(select, 'Completadas (menor a mayor)');
    expect(order()).toEqual([
      'Inventario mensual',
      'Devolución',
      'Recepción de mercadería',
      'Apertura del local',
      'Cierre de caja',
    ]);
    // The same state as the headers.
    expect(header('Completadas')).toHaveAttribute('aria-sort', 'ascending');
    await user.selectOptions(select, 'Mayor tiempo medio primero (por defecto)');
    expect(order()).toEqual(DEFAULT);
  });

  test('a single procedure needs no selector', () => {
    renderTable([PROCEDURES[0]]);

    expect(screen.queryByRole('combobox', { name: 'Ordenar por' })).not.toBeInTheDocument();
  });
});
