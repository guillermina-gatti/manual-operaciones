'use client';

// The pieces to sort a table by column (lib/executions/table-sort.ts), shared by "Tiempo por
// procedimiento" and "Tus procedimientos recientes": the state, the header that is a button and the
// selector of the phone. The order is only state of the table: it does not go to the address nor
// to the browser, and it starts again when the table mounts again (the filters change).
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ariaSort,
  nextSort,
  sortOptions,
  sortRows,
  sortValue,
} from '@/lib/executions/table-sort';
import type { SortColumn, SortState } from '@/lib/executions/table-sort';
import { TABLE_TH } from './activity-design';

export function useTableSort<T, K extends string>(
  rows: readonly T[],
  columns: readonly SortColumn<T, K>[],
  nameOf: (row: T) => string,
) {
  const [sort, setSort] = useState<SortState<K> | null>(null);
  return {
    sort,
    rows: sortRows(rows, sort, columns, nameOf),
    toggle(column: SortColumn<T, K>) {
      setSort((current) => nextSort(current, column));
    },
    setSort,
  };
}

// A header that sorts: a button inside the th, which carries aria-sort. The arrow only on the
// active column, hidden from a screen reader (aria-sort says it). Enter and Space are the button's.
export function SortableHeader<T, K extends string>({
  column,
  sort,
  onToggle,
  children,
}: {
  column: SortColumn<T, K>;
  sort: SortState<K> | null;
  onToggle: (column: SortColumn<T, K>) => void;
  // The words of the header when they are not only the label (a long name for a screen reader).
  children?: ReactNode;
}) {
  const state = ariaSort(sort, column.key);
  return (
    <th scope="col" aria-sort={state} className={TABLE_TH}>
      <button
        type="button"
        onClick={() => onToggle(column)}
        className="-mx-1.5 -my-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-left font-bold tracking-[0.02em] uppercase hover:bg-blanco/60 focus-visible:outline-naranja"
      >
        {children ?? column.label}
        <span aria-hidden="true" data-testid="sort-arrow" className="w-3 shrink-0 text-[10px]">
          {state === 'ascending' ? '▲' : state === 'descending' ? '▼' : ''}
        </span>
      </button>
    </th>
  );
}

// Below lg the table is cards, with no headers: a native selector with the same orders.
export function SortSelect<T, K extends string>({
  columns,
  defaultLabel,
  sort,
  onChange,
}: {
  columns: readonly SortColumn<T, K>[];
  // "Mayor tiempo medio primero (por defecto)".
  defaultLabel: string;
  sort: SortState<K> | null;
  onChange: (sort: SortState<K> | null) => void;
}) {
  const id = useId();
  const options = sortOptions(columns, defaultLabel);
  return (
    <div className="flex flex-col gap-1.5 lg:hidden">
      <label htmlFor={id} className="text-sm font-semibold text-texto">
        Ordenar por
      </label>
      <select
        id={id}
        value={sortValue(sort)}
        onChange={(event) =>
          onChange(options.find((option) => option.value === event.target.value)?.sort ?? null)
        }
        className="min-h-11 w-full rounded-xl border border-[#DDE3DE] bg-blanco px-3 text-base text-texto focus-visible:outline-naranja"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
