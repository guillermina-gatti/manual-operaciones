// The colors of the weekly nest and the daily chart of Mi actividad (approved mockup) that are not
// tokens of globals.css. Where a token exists, the components use it: naranja (#E85114), bosque
// (#0B4233), blanco, texto-suave. The mud of the nest is lighter than the barro token (#9C5A2E): the
// mockup asks for these shades, so they live here and not in globals.css.
//
// Contrast measured on white (or on its own background):
// - NEST_LABEL / CHART_TEXT_STRONG #2C4B41: 9,6:1. CHART_AXIS_TEXT #4F6B60: 5,8:1.
// - NEST_RESETS #8A3410 on #FDEBE2: 7,0:1. NEST_COMPLETE #1B6B3F on #E3F3E9: 5,7:1.
// - The layers, the circles and the bars are not text and never go alone: the title says how many
//   days, each circle has its day and its words for screen readers, and the chart has a legend,
//   a box with the numbers and a table. The yellow (#EDA100, 2,2:1) and the aqua (#1BAF7A, 2,8:1)
//   of the chart are below 3:1 on white: that is why the legend, the box and the table are always
//   there, and why texts never take the color of a series.

// --- Card -----------------------------------------------------------------------------------------

export const ACTIVITY_CARD =
  'rounded-3xl border border-[#DDE3DE] bg-blanco shadow-[0_4px_16px_rgba(11,66,51,0.06)]';

// --- The weekly nest ------------------------------------------------------------------------------

export const NEST_FRAME = 'rounded-[20px] border-[1.5px] border-[#C9D8CF] bg-blanco';
export const NEST_LABEL = 'text-[#2C4B41]';

// From the bottom up: the finished layers in mud, darker at the bottom. The last finished one is
// always orange (naranja); the empty ones a light mud.
export const NEST_MUD = ['#9A6A45', '#B07C54', '#C48A5E', '#D39A6F'] as const;
export const NEST_LAST = 'var(--color-naranja)';
export const NEST_EMPTY = '#F1E3D5';
export const NEST_OUTLINE = '#9A6A45';
export const NEST_ENTRANCE = '#4A2F1D';

export const NEST_RESETS = 'bg-[#FDEBE2] text-[#8A3410]';
export const NEST_COMPLETE = 'bg-[#E3F3E9] text-[#1B6B3F]';
// A day without progress: a dashed circle.
export const NEST_DAY_EMPTY = 'border-2 border-dashed border-[#B8C7BF]';

// --- The daily chart ------------------------------------------------------------------------------

export const CHART_TEXT_STRONG = 'text-[#2C4B41]';
export const CHART_AXIS_TEXT = '#4F6B60';
export const CHART_GRID = '#E6E8E4';
// In the order of the procedures with the most completed executions; the rest go together as
// "Otros N procedimientos" in the darkest mud of the nest.
export const CHART_SERIES = ['#E85114', '#0B4233', '#EDA100', '#1BAF7A'] as const;
export const CHART_OTHERS = '#9A6A45';
