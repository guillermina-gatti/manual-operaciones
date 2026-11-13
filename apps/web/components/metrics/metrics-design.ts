// The colors of /metricas that are not tokens of globals.css. The ones /ejecuciones/mi-actividad
// already uses (the hero, the tables) live in components/executions/activity-design.ts and are
// imported from there; here only the ones /metricas adds. Where a token exists, the components use
// the token. Contrast measured where there is text on them.

import { DONE_FILL, ROW_LINE, TABLE_TD } from '@/components/executions/activity-design';

// The tab selector: a white group with a gray border. Not text: the border only frames the tabs.
export const TABS_FRAME = 'border border-[#D5D9D3] bg-blanco';

// "Resumen general": the abandoned part of the bar and its dot, white at 55 % on bosque (4,6:1 against
// bosque; not text). Completed and in progress are the ones of Mi actividad (OUTCOME_FILL).
export const ABANDONED_FILL = 'bg-blanco/55';

// The section titles of /metricas carry a 4 px orange bar on their left: naranja as an indicator,
// never as text (DESIGN.md 2.2).
export const SECTION_MARK = 'h-[1em] w-1 shrink-0 rounded-full bg-naranja';

// Every data cell of the tables of /metricas: to the left, headers included, with tabular-nums, so
// the columns read as columns.
export const DATA_CELL = `${TABLE_TD} text-left tabular-nums`;

// "Detalle por área", flat: no gradient and no orange stripe anywhere.
// The area card: white, the border of the tables, 24 px of radius and a soft bosque shadow.
export const AREA_CARD =
  'overflow-hidden rounded-3xl border border-[#DDE3DE] bg-blanco shadow-[0_4px_16px_rgba(11,66,51,0.06)]';
// The strip over the procedures: the background and text of the table heads (TABLE_HEAD, 8,2:1).
// texto-suave would give 4,45:1 on #E6EFE9.
// The area summary, under the name of the area, on white: four data split by the thin line of the
// table rows, and an 8 px bar with 4 px of radius. Completed in the green of the bars (DONE_FILL),
// in progress in the blue of "En curso" (the token azul-borrador) and abandoned in a soft blue gray.
// Not text: the data above say every number.
export const SUMMARY_DIVIDER = ROW_LINE;
export const AREA_BAR = 'mt-4 h-2 rounded-[4px] bg-[#EEF0EC]';
export const AREA_BAR_FILL = {
  completed: DONE_FILL,
  inProgress: 'bg-azul-borrador',
  abandoned: 'bg-[#B4C0CC]',
} as const;
// A closed procedure row, on hover: pale green (texto-suave on it 4,86:1, durazno-texto 5,41:1).
export const ROW_HOVER = 'hover:bg-[#F3F8F5]';
// The open procedure row: solid bosque with white text (11,4:1); its secondary texts are HERO_MUTED
// (8,1:1) and its abandoned ones, when there are any, a light peach (8,3:1). The completed bar goes
// light green (RING_STROKE's #7FD1A5, 6,3:1) over white at 22 %.
export const OPEN_ROW = 'bg-bosque text-blanco';
export const OPEN_ALERT = 'text-[#FFD2BC]';
export const OPEN_BAR_TRACK = 'bg-blanco/22';
export const OPEN_BAR_FILL = 'bg-[#7FD1A5]';
// The chevron's circle: a gray ring when closed, white at 18 % when open.
export const CHEVRON_CLOSED = 'border border-[#DDE3DE] text-bosque';
export const CHEVRON_OPEN = 'border border-transparent bg-blanco/18 text-blanco';
// The steps table: the border of the tables with 14 px of radius; the last row, pale green.
export const STEPS_FRAME = 'overflow-hidden rounded-[14px] border border-[#DDE3DE] bg-blanco';
export const TOTAL_ROW = 'border-t-2 border-bosque bg-[#F3F8F5]';

// The assistant panel: answered, without information, with a contradiction and AI not available.
// On bosque, as graphics: 6,3:1, 4,7:1, 6,2:1 and 6,6:1.
export const ASSISTANT_FILL = {
  answered: 'bg-[#7FD1A5]',
  noInfo: 'bg-[#6CA8FF]',
  conflict: 'bg-[#C4B5FD]',
  aiUnavailable: 'bg-[#FFB48F]',
} as const;

// The cards of the documents and the assistant: the frame of the tables (activity-design.ts).
// A tile of the documents carries a 5 px stripe on its left in the color of its state.
export const TILE_STRIPE = 'absolute inset-y-0 left-0 w-[5px]';
