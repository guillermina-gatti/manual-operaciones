// The colors of Mi actividad (the summary panel and the recent procedures table) that are not tokens
// of globals.css. They are defined only here, as FILE_TYPE_COLORS in list-design.tsx: whoever needs one
// imports it. Where a token exists, the components use the token (bosque, blanco, salvia,
// texto-suave, durazno-texto, chip-area). Contrast measured:
// - HERO_MUTED on bosque: 8,1:1. White on bosque: 11,4:1.
// - TABLE_HEAD text on its background: 8,2:1. SLOW_TAG: 7,0:1. The muted 0 of the table uses
//   texto-suave (5,2:1): the gray #7A8F87 gives 3,4:1 and does not reach AA.
// The bar colors are not text: on bosque they are well over 3:1.

// --- "Tu resumen" (on bosque) ----------------------------------------------------------------------

// Secondary text on bosque: the label of the period, the legend, the names of the data.
export const HERO_MUTED = 'text-[#C9DED3]';
export const HERO_DIVIDER = 'border-blanco/15';

// The ring and the three parts of the bar: completed, in progress and without progress.
export const RING_STROKE = 'stroke-[#7FD1A5]';
export const RING_TRACK = 'stroke-blanco/16';
export const OUTCOME_FILL = {
  completed: 'bg-[#7FD1A5]',
  inProgress: 'bg-[#6CA8FF]',
  stale: 'bg-[#FFB48F]',
} as const;

// --- "Tus procedimientos recientes" ----------------------------------------------------------------

export const TABLE_FRAME = 'rounded-[20px] border border-[#DDE3DE] bg-blanco';
export const TABLE_HEAD = 'bg-[#E6EFE9] text-[#2C4B41]';
export const ROW_LINE = 'border-[#EEF0EC]';
// The cells, shared with "Tiempo por procedimiento" of /metricas: every column to the left. From lg,
// the padding of the row (16 × 24) and 16 px between columns; as a card, no padding of its own.
export const TABLE_TH =
  'px-2 py-3 text-left text-xs font-bold tracking-[0.02em] whitespace-nowrap uppercase first:pl-6 last:pr-6';
export const TABLE_TD = 'lg:px-2 lg:py-4 lg:align-middle lg:first:pl-6 lg:last:pr-6';
// What only the card says ("Tiempo medio", "Se traba en:"…), hidden from lg.
export const TABLE_CARD_LABEL =
  'block text-xs font-semibold tracking-wide text-texto-suave uppercase lg:hidden';

// The bar of completed over started, under "11 de 12".
export const DONE_TRACK = 'bg-[#E6EFE9]';
export const DONE_FILL = 'bg-[#1B9B5B]';

// The time of the slowest step, next to its name.
export const SLOW_TAG =
  'inline-flex shrink-0 items-center rounded-[7px] bg-[#FDEBE2] px-2 py-0.5 text-xs font-bold whitespace-nowrap text-[#8A3410] tabular-nums';
