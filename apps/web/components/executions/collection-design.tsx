// The two views shared by the procedure picker (/ejecuciones) and "Para retomar" (Mi actividad).
//
// Tarjetas: every card has the same structure, so the area chip is always in the same place, with
// or without a state: (a) a first row of at least 28 px, with the areas and the steps on the left
// and the state, if any, on the right; (b) the title; (c) the description, up to 2 lines; (d) the
// button at the foot (margin-top: auto). The cards of a row have the same height.
//
// Lista: fixed columns, the same in the header and in every row, so everything lines up: name |
// areas and steps | state (empty when there is none, without moving the others) | a button of
// 150 px. Below md the row stacks: name, then the data, then the button across.
//
// Only classes and small pieces on top of design.tsx and list-design.tsx, imported as they are.
import { CARD, StatusDot } from '@/components/documents/design';
import { LIST_BUTTON_PRIMARY, ROW_PANEL } from '@/components/documents/list-design';

// --- Tarjetas --------------------------------------------------------------------------------------

export const CARD_GRID = 'grid grid-cols-1 gap-4 md:auto-rows-fr md:grid-cols-2 md:gap-5';

export const ITEM_CARD = `${CARD} flex h-full min-w-0 flex-col gap-3 p-5`;

// (a): areas and steps on the left, the state on the right.
export const CARD_META = 'flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1';

// (d): at the foot, on the left; 44 px high; across on the phone.
export const CARD_ACTION = `${LIST_BUTTON_PRIMARY} mt-auto min-h-11! w-full sm:w-auto sm:self-start`;

// --- Lista -----------------------------------------------------------------------------------------

export const ROW_COLUMNS =
  'md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_150px] md:items-center md:gap-x-4';

export const LIST_PANEL = ROW_PANEL;

export const LIST_ROW = `flex min-w-0 flex-col gap-3 px-4 py-4 md:gap-y-0 ${ROW_COLUMNS}`;

// The name cell: the title whole (it may wrap) and the description in one line, with "…".
export const ROW_NAME = 'flex min-w-0 flex-col gap-0.5';

// The data cells: on the phone, side by side under the name.
export const ROW_DATA = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1';

export const ROW_ACTION = `${LIST_BUTTON_PRIMARY} min-h-11! w-full md:w-[150px] md:px-3`;

// The column names, only visual (aria-hidden): each row says what each thing is.
export function ListHeader({ columns }: { columns: [string, string, string] }) {
  return (
    <div
      aria-hidden="true"
      className={`hidden border-b border-borde bg-fondo px-4 py-2.5 text-xs font-semibold tracking-wide text-texto-suave uppercase md:grid ${ROW_COLUMNS}`}
    >
      {columns.map((column) => (
        <span key={column}>{column}</span>
      ))}
      <span />
    </div>
  );
}

// --- Piezas ----------------------------------------------------------------------------------------

// "EN CURSO · PASO 3 DE 5": a blue dot and the words (the color never goes alone).
export function InProgressMark({ order, total }: { order: number; total: number }) {
  return (
    <span className="tracking-wide uppercase">
      <StatusDot tone="azul">
        En curso · paso {order} de {total}
      </StatusDot>
    </span>
  );
}
