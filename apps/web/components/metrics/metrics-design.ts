// The colors of /metricas that are not tokens of globals.css. The ones /ejecuciones/mi-actividad
// already uses (the hero, the tables) live in components/executions/activity-design.ts and are
// imported from there; here only the ones /metricas adds. Where a token exists, the components use
// the token. Contrast measured where there is text on them.

// The tab selector: a white group with a gray border. Not text: the border only frames the tabs.
export const TABS_FRAME = 'border border-[#D5D9D3] bg-blanco';

// "Resumen general": the abandoned part of the bar and its dot, white at 55 % on bosque (about 4,9:1
// against bosque; not text). Completed and in progress are the ones of Mi actividad (OUTCOME_FILL).
export const ABANDONED_FILL = 'bg-blanco/55';

// The section titles of /metricas carry a 4 px orange bar on their left: naranja as an indicator,
// never as text (DESIGN.md 2.2).
export const SECTION_MARK = 'h-[1em] w-1 shrink-0 rounded-full bg-naranja';
