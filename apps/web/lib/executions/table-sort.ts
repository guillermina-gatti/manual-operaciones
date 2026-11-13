// Sorting a table by one of its columns, shared by "Tiempo por procedimiento" (/metricas) and "Tus
// procedimientos recientes" (/ejecuciones/mi-actividad). Pure: the component keeps the state.
//
// A click on a column goes through three states: first its own direction (descending for numbers
// and dates, ascending for names), then the opposite, then back to the default order of the table.
// Rows compare by their real values (milliseconds, counts, timestamps), never by the text shown
// ("11 h 54 min" against "8 s"); a tie goes by name. A row without a value (null) always goes last,
// whatever the direction.

export type SortDirection = 'ascending' | 'descending';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export interface SortColumn<T, K extends string> {
  key: K;
  // The words of the header: "Tiempo medio total".
  label: string;
  // A number (ms, a count, a timestamp) or a name; null when there is none.
  value: (row: T) => number | string | null;
  // The direction of the first click.
  first: SortDirection;
  // How each direction reads in the selector of the phone; by default names go A → Z and numbers
  // mayor a menor.
  words?: Record<SortDirection, string>;
}

const opposite = (direction: SortDirection): SortDirection =>
  direction === 'ascending' ? 'descending' : 'ascending';

// The next state after a click on the column: its first direction, the opposite, the default (null).
export function nextSort<T, K extends string>(
  current: SortState<K> | null,
  column: SortColumn<T, K>,
): SortState<K> | null {
  if (!current || current.key !== column.key) return { key: column.key, direction: column.first };
  if (current.direction === column.first) {
    return { key: column.key, direction: opposite(column.first) };
  }
  return null;
}

// The aria-sort of the header of a column.
export function ariaSort<K extends string>(
  sort: SortState<K> | null,
  key: K,
): 'ascending' | 'descending' | 'none' {
  return sort?.key === key ? sort.direction : 'none';
}

const names = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return names.compare(String(a), String(b));
}

// Without a sort, the rows as they came (the default order of each table). With one, by the column,
// the nulls last, a tie by name and then as they came.
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  columns: readonly SortColumn<T, K>[],
  nameOf: (row: T) => string,
): T[] {
  const column = sort && columns.find((candidate) => candidate.key === sort.key);
  if (!sort || !column) return [...rows];
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: column.value(row) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return names.compare(nameOf(a.row), nameOf(b.row)) || a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      return (
        sign * compareValues(a.value, b.value) ||
        names.compare(nameOf(a.row), nameOf(b.row)) ||
        a.index - b.index
      );
    })
    .map(({ row }) => row);
}

// The options of the selector of the phone, where the table is cards and there are no headers: the
// default order, then each column in both directions, its first one first.
export interface SortOption<K extends string> {
  value: string;
  label: string;
  sort: SortState<K> | null;
}

export const DEFAULT_SORT_VALUE = 'default';

const DIRECTION_WORDS = {
  name: { ascending: 'A → Z', descending: 'Z → A' },
  number: { ascending: 'menor a mayor', descending: 'mayor a menor' },
} as const;

export function sortOptions<T, K extends string>(
  columns: readonly SortColumn<T, K>[],
  defaultLabel: string,
): SortOption<K>[] {
  const directionWords = (column: SortColumn<T, K>, direction: SortDirection) =>
    (column.words ?? DIRECTION_WORDS[column.first === 'ascending' ? 'name' : 'number'])[direction];
  return [
    { value: DEFAULT_SORT_VALUE, label: defaultLabel, sort: null },
    ...columns.flatMap((column) =>
      [column.first, opposite(column.first)].map((direction) => ({
        value: `${column.key}:${direction}`,
        label: `${column.label} (${directionWords(column, direction)})`,
        sort: { key: column.key, direction },
      })),
    ),
  ];
}

export function sortValue<K extends string>(sort: SortState<K> | null): string {
  return sort ? `${sort.key}:${sort.direction}` : DEFAULT_SORT_VALUE;
}
