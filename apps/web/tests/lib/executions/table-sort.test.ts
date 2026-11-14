import { describe, expect, test } from 'vitest';
import {
  DEFAULT_SORT_VALUE,
  ariaSort,
  nextSort,
  sortOptions,
  sortRows,
  sortValue,
} from '@/lib/executions/table-sort';
import type { SortColumn } from '@/lib/executions/table-sort';

interface Row {
  name: string;
  ms: number | null;
}
type Key = 'name' | 'ms';

const COLUMNS: SortColumn<Row, Key>[] = [
  { key: 'name', label: 'Procedimiento', value: (row) => row.name, first: 'ascending' },
  { key: 'ms', label: 'Tiempo medio', value: (row) => row.ms, first: 'descending' },
];
const [NAME, MS] = COLUMNS;
const nameOf = (row: Row) => row.name;

// "11 h 54 min" against "8 s": as text, "8 s" would go first.
const ROWS: Row[] = [
  { name: 'Cierre', ms: 8_000 },
  { name: 'Recepción', ms: 42_840_000 },
  { name: 'Inventario', ms: null },
  { name: 'apertura', ms: 380_000 },
  { name: 'Devolución', ms: 380_000 },
];
const names = (rows: Row[]) => rows.map((row) => row.name);

describe('nextSort', () => {
  test('numbers: descending, ascending, then the default', () => {
    const first = nextSort(null, MS);
    expect(first).toEqual({ key: 'ms', direction: 'descending' });
    const second = nextSort(first, MS);
    expect(second).toEqual({ key: 'ms', direction: 'ascending' });
    expect(nextSort(second, MS)).toBeNull();
  });

  test('names: ascending first', () => {
    expect(nextSort(null, NAME)).toEqual({ key: 'name', direction: 'ascending' });
    expect(nextSort({ key: 'name', direction: 'ascending' }, NAME)).toEqual({
      key: 'name',
      direction: 'descending',
    });
  });

  test('another column starts in its own first direction', () => {
    expect(nextSort({ key: 'name', direction: 'descending' }, MS)).toEqual({
      key: 'ms',
      direction: 'descending',
    });
  });
});

describe('sortRows', () => {
  test('without a sort, the rows as they came', () => {
    expect(names(sortRows(ROWS, null, COLUMNS, nameOf))).toEqual(names(ROWS));
  });

  test('by the real value, not the text; a tie by name; the null last', () => {
    expect(names(sortRows(ROWS, { key: 'ms', direction: 'descending' }, COLUMNS, nameOf))).toEqual(
      ['Recepción', 'apertura', 'Devolución', 'Cierre', 'Inventario'],
    );
  });

  test('the null stays last going up too', () => {
    expect(names(sortRows(ROWS, { key: 'ms', direction: 'ascending' }, COLUMNS, nameOf))).toEqual([
      'Cierre',
      'apertura',
      'Devolución',
      'Recepción',
      'Inventario',
    ]);
  });

  test('names without case or accents mattering', () => {
    expect(names(sortRows(ROWS, { key: 'name', direction: 'ascending' }, COLUMNS, nameOf))).toEqual(
      ['apertura', 'Cierre', 'Devolución', 'Inventario', 'Recepción'],
    );
  });

  test('does not change the rows it gets', () => {
    const copy = [...ROWS];
    sortRows(ROWS, { key: 'ms', direction: 'ascending' }, COLUMNS, nameOf);
    expect(ROWS).toEqual(copy);
  });
});

describe('aria-sort and the selector', () => {
  test('aria-sort only on the active column', () => {
    const sort = { key: 'ms', direction: 'ascending' } as const;
    expect(ariaSort(sort, 'ms')).toBe('ascending');
    expect(ariaSort(sort, 'name')).toBe('none');
    expect(ariaSort(null, 'ms')).toBe('none');
  });

  test('the default, then each column in both directions, its first one first', () => {
    expect(sortOptions(COLUMNS, 'Por defecto').map((option) => option.label)).toEqual([
      'Por defecto',
      'Procedimiento (A → Z)',
      'Procedimiento (Z → A)',
      'Tiempo medio (mayor a menor)',
      'Tiempo medio (menor a mayor)',
    ]);
    expect(sortValue(null)).toBe(DEFAULT_SORT_VALUE);
    expect(sortValue({ key: 'ms', direction: 'descending' })).toBe('ms:descending');
  });

  test('a column can say its own words', () => {
    const last: SortColumn<Row, Key> = {
      ...MS,
      label: 'Última vez',
      words: { descending: 'más reciente primero', ascending: 'más vieja primero' },
    };
    expect(sortOptions([last], 'Por defecto')[1].label).toBe('Última vez (más reciente primero)');
  });
});
