// The colors of /metricas that are not tokens of globals.css. The ones /ejecuciones/mi-actividad
// already uses (the hero, the tables) live in components/executions/activity-design.ts and are
// imported from there; here only the ones /metricas adds. Where a token exists, the components use
// the token. Contrast measured where there is text on them.

import { TABLE_TD } from '@/components/executions/activity-design';

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

// "Detalle por área": the head of an area card fades from the green of the table heads to white.
// The text on it is texto (12,5:1 on #E6EFE9); texto-suave would give 4,45:1 there.
export const AREA_HEAD = 'bg-linear-to-b from-[#E6EFE9] to-blanco';
// An open procedure: 5 px of naranja on its left (an indicator) and a pale green background. On
// #F3F8F5: texto 13,7:1, texto-suave 4,86:1, durazno-texto 5,41:1.
export const OPEN_PROCEDURE = 'border-l-[5px] border-naranja bg-[#F3F8F5]';
export const CLOSED_PROCEDURE = 'border-l-[5px] border-transparent';

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
