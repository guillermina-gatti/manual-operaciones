// The hornero's nest of an execution: a mud dome with one horizontal layer per step, from the
// bottom up, and the dark entrance on one side. Finished layers in shades of mud (darker at the
// bottom), the current one in the brand's orange and the pending ones in light beige. Decorative
// (aria-hidden): whoever uses it tells the progress with words and a progressbar.
//
// When a step is finished its layer fills from the bottom in 400 ms; with "reduce motion" nothing
// moves and the change is instant. The transition only runs on a change, never on the first
// render, so a resumed execution does not animate the layers it already had.
import { useId } from 'react';

export type NestLayerState = 'done' | 'current' | 'pending';

interface ProgressNestProps {
  total: number;
  // How many steps are finished, from the first one.
  finishedCount: number;
  // 1-based number of the current step; null when there is none (completed).
  currentNumber: number | null;
  className?: string;
}

// The mockup: viewBox 0 0 120 72, the dome from y=64 up to y=6.
// Shared with the weekly nest of Mi actividad.
export const NEST_DOME = 'M10 64 C10 22 40 6 60 6 C80 6 110 22 110 64 Z';
const DOME = NEST_DOME;
const BASE_Y = 64;
const LAYERS_HEIGHT = 56; // 5 layers of 11.2
const SEPARATOR = 1.2;

// TODO(B): the shades of the nest are not team tokens. They are mixed here from barro, barro-puerta
// and blanco, so no new hex is written; propose --color-nido-* in globals.css (shared, not changed
// by us) if the team wants them elsewhere.
const PENDING_FILL = 'color-mix(in srgb, var(--color-barro) 16%, var(--color-blanco))';
const CURRENT_FILL = 'var(--color-naranja)';
const OUTLINE = 'color-mix(in srgb, var(--color-barro) 45%, var(--color-blanco))';

// The shade of a finished layer: from barro with some barro-puerta at the bottom to barro with
// some white at the top.
export function mudShade(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const shift = Math.round(-30 + 60 * t);
  return shift < 0
    ? `color-mix(in srgb, var(--color-barro) ${100 + shift}%, var(--color-barro-puerta))`
    : `color-mix(in srgb, var(--color-barro) ${100 - shift}%, var(--color-blanco))`;
}

export function layerState(
  number: number,
  finishedCount: number,
  currentNumber: number | null,
): NestLayerState {
  if (number <= finishedCount) return 'done';
  if (number === currentNumber) return 'current';
  return 'pending';
}

export function ProgressNest({
  total,
  finishedCount,
  currentNumber,
  className = '',
}: ProgressNestProps) {
  // url(#…) does not like the colons of React's ids.
  const clipId = `nest-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const count = Math.max(total, 1);
  const height = LAYERS_HEIGHT / count;
  const separator = Math.min(SEPARATOR, height * 0.3);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 72"
      className={`block h-auto ${className}`}
      data-nest-layers={total}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={DOME} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {Array.from({ length: total }, (_, index) => {
          const number = index + 1;
          const state = layerState(number, finishedCount, currentNumber);
          const top = index === total - 1;
          // The top layer reaches the top of the dome.
          const y = top ? 0 : BASE_Y - number * height;
          const layerHeight = top ? BASE_Y - index * height : height;
          return (
            <g key={number} data-layer={number} data-state={state}>
              <rect
                x={0}
                y={y}
                width={120}
                height={layerHeight}
                style={{ fill: state === 'current' ? CURRENT_FILL : PENDING_FILL }}
                className="transition-[fill] duration-400 ease-out motion-reduce:transition-none"
              />
              {/* The mud of a finished step: grows from the bottom of its layer. */}
              <rect
                data-fill
                x={0}
                y={y}
                width={120}
                height={layerHeight}
                style={{ fill: mudShade(index, total) }}
                className={`origin-bottom transition-transform duration-400 ease-out [transform-box:fill-box] motion-reduce:transition-none ${
                  state === 'done' ? 'scale-y-100' : 'scale-y-0'
                }`}
              />
            </g>
          );
        })}
        {Array.from({ length: Math.max(total - 1, 0) }, (_, index) => {
          const y = BASE_Y - (index + 1) * height;
          return (
            <line
              key={index}
              x1={0}
              x2={120}
              y1={y}
              y2={y}
              strokeWidth={separator}
              style={{ stroke: 'var(--color-blanco)' }}
            />
          );
        })}
      </g>
      <path d={DOME} fill="none" strokeWidth={1.2} style={{ stroke: OUTLINE }} />
      <ellipse cx={95} cy={46} rx={7} ry={9} style={{ fill: 'var(--color-barro-puerta)' }} />
    </svg>
  );
}
