'use client';

// "Tu nido de esta semana", at the top of Mi actividad: one layer of the hornero's nest for each
// working day (Monday to Friday) with progress. It never depends on the filters of the page: it is
// always the current week of the whole person (GET /metrics/me/daily, without an area). Its own
// request, with its own loading and error states, so it never hides the rest of the page.
//
// No streaks, no losses, no comparing with anyone. The only movement is the fill of a layer
// (300 ms), still with "reduce motion".
import Link from 'next/link';
import { useId } from 'react';
import { CheckIcon } from '@/components/metrics/icons';
import { describeMyMetricsError, getMyDailyActivity, useApiResource } from '@/lib/api';
import type { ApiResource, MyDailyActivityResponse } from '@/lib/api';
import {
  NEST_DAYS,
  activeDaysCount,
  nestBadge,
  nestDays,
  nestSupportText,
  nestTitle,
  weekRangeLabel,
} from '@/lib/executions/weekly-nest';
import { todayInCompany } from '@/lib/metrics/filters';
import { useSession } from '@/lib/session';
import {
  ACTIVITY_CARD,
  NEST_COMPLETE,
  NEST_DAY_EMPTY,
  NEST_EMPTY,
  NEST_ENTRANCE,
  NEST_FRAME,
  NEST_LABEL,
  NEST_LAST,
  NEST_MUD,
  NEST_OUTLINE,
  NEST_RESETS,
} from './nest-design';
import { NEST_DOME } from './ProgressNest';

const CARD_PADDING = 'px-5 py-5 md:px-7 md:py-6';
// 44 px, bosque: the way to start when the week has no progress yet.
const START_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-bosque px-4 text-sm font-semibold text-blanco transition hover:bg-bosque-hover active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0';
const RETRY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl border-[1.5px] border-bosque bg-blanco px-4 text-sm font-semibold text-bosque transition hover:bg-salvia active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0';

export function WeeklyNest() {
  const { user } = useSession();
  // The key includes the user: switching test users asks again.
  const state = useApiResource(user ? `my-daily-nest:${user.id}` : null, (signal) =>
    getMyDailyActivity(null, signal),
  );
  return <WeeklyNestView state={state} today={todayInCompany()} />;
}

interface WeeklyNestViewProps {
  state: ApiResource<MyDailyActivityResponse>;
  // "YYYY-MM-DD" in the company time zone.
  today: string;
}

export function WeeklyNestView({ state, today }: WeeklyNestViewProps) {
  const headingId = useId();

  if (state.status === 'success') {
    return <NestContent week={state.data.week} today={today} headingId={headingId} />;
  }

  if (state.status === 'error') {
    const { message, canRetry } = describeMyMetricsError(state.error);
    return (
      <section aria-labelledby={headingId} className={`${ACTIVITY_CARD} ${CARD_PADDING}`}>
        <h2 id={headingId} className={`text-xs font-bold tracking-[0.06em] uppercase ${NEST_LABEL}`}>
          Tu nido de esta semana
        </h2>
        <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-texto">
            No se pudo cargar tu nido de esta semana. {message}
          </p>
          {canRetry && (
            <button type="button" onClick={state.reload} className={RETRY_BUTTON}>
              Reintentar
            </button>
          )}
        </div>
      </section>
    );
  }

  return <WeeklyNestSkeleton />;
}

// The same size as the card: the nest, three lines and the five days.
export function WeeklyNestSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid="weekly-nest-loading">
      <p className="sr-only">Cargando tu nido de esta semana…</p>
      <div
        aria-hidden="true"
        className={`${ACTIVITY_CARD} ${CARD_PADDING} grid animate-pulse grid-cols-[auto_1fr] gap-x-4 gap-y-4 motion-reduce:animate-none md:grid-cols-[auto_1fr_auto] md:gap-x-7`}
      >
        <div className="h-[90px] w-[139px] rounded-[20px] bg-borde md:row-span-3 md:h-[155px] md:w-[243px]" />
        <div className="flex flex-col gap-3 self-center">
          <div className="h-3 w-48 max-w-full rounded bg-borde" />
          <div className="h-7 w-64 max-w-full rounded bg-borde" />
          <div className="h-4 w-80 max-w-full rounded bg-borde max-md:hidden" />
          <div className="flex gap-3 max-md:hidden">
            {Array.from({ length: NEST_DAYS }, (_, i) => (
              <div key={i} className="size-[34px] rounded-full bg-borde" />
            ))}
          </div>
        </div>
        <div className="h-7 w-36 rounded-[7px] bg-borde max-md:col-span-2 md:self-center" />
      </div>
    </div>
  );
}

interface NestContentProps {
  week: MyDailyActivityResponse['week'];
  today: string;
  headingId: string;
}

function NestContent({ week, today, headingId }: NestContentProps) {
  const filled = activeDaysCount(week.activeDays);
  const days = nestDays(week.from, week.activeDays, today);
  const badge = nestBadge(filled);
  const range = weekRangeLabel(week.from, week.to);

  return (
    <section
      aria-labelledby={headingId}
      data-testid="weekly-nest"
      className={`${ACTIVITY_CARD} ${CARD_PADDING} grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-7`}
    >
      <div className={`${NEST_FRAME} col-start-1 row-start-1 px-3 py-2.5 md:row-span-3 md:px-5 md:py-4`}>
        <WeeklyNestSvg filled={filled} className="w-[112px] md:w-[200px]" />
      </div>

      <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1.5 md:self-end">
        <h2 id={headingId} className={`text-xs font-bold tracking-[0.06em] uppercase ${NEST_LABEL}`}>
          Tu nido de esta semana{range && <> · {range}</>}
        </h2>
        <p className="text-xl leading-tight font-bold text-texto md:text-[26px]">{nestTitle(filled)}</p>
      </div>

      <p className="col-span-2 text-sm text-texto-suave md:col-span-1 md:col-start-2 md:row-start-2">
        {nestSupportText(filled, week.completedCount)}
      </p>

      <ul
        role="list"
        aria-label="Días de la semana"
        className="col-span-2 flex justify-between gap-2 sm:justify-start sm:gap-4 md:col-span-1 md:col-start-2 md:row-start-3"
      >
        {days.map((day) => (
          <li
            key={day.date}
            data-active={day.active}
            data-today={day.today}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={`flex size-[30px] items-center justify-center rounded-full md:size-[34px] ${
                day.active
                  ? 'bg-bosque text-blanco'
                  : day.today
                    ? 'border-2 border-naranja'
                    : NEST_DAY_EMPTY
              }`}
            >
              {day.active && <CheckIcon className="size-4" />}
            </span>
            <span
              aria-hidden="true"
              className={`text-xs whitespace-nowrap text-texto ${day.today ? 'font-bold' : ''}`}
            >
              {day.today ? `${day.short} · hoy` : day.short}
            </span>
            <span className="sr-only">{day.label}</span>
          </li>
        ))}
      </ul>

      <div className="col-span-2 md:col-span-1 md:col-start-3 md:row-span-3 md:row-start-1 md:self-center">
        {badge === 'complete' && (
          <span className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-xs font-bold ${NEST_COMPLETE}`}>
            <span aria-hidden="true">✓</span> Semana completa
          </span>
        )}
        {badge === 'resets' && (
          <span className={`inline-flex items-center rounded-[7px] px-2.5 py-1 text-xs font-bold ${NEST_RESETS}`}>
            Se reinicia el lunes
          </span>
        )}
        {badge === 'start' && (
          <Link href="/ejecuciones" className={START_BUTTON}>
            Elegir un procedimiento
          </Link>
        )}
      </div>
    </section>
  );
}

// The mockup: the dome of the nest of an execution (viewBox 0 0 120 72) as a clip, and five layers
// from the bottom up that overlap a little and have no stroke, so the nest looks like one piece.
const LAYER_Y = [52.8, 41.6, 30.4, 19.2, 8] as const;
const LAYER_HEIGHT = 11.6;

// The color of a layer (0 = the bottom one) with `filled` layers filled.
export function nestLayerFill(index: number, filled: number): string {
  if (index >= filled) return NEST_EMPTY;
  if (index === filled - 1) return NEST_LAST;
  return NEST_MUD[index];
}

export function WeeklyNestSvg({ filled, className = '' }: { filled: number; className?: string }) {
  // url(#…) does not like the colons of React's ids.
  const clipId = `weekly-nest-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 72"
      className={`block h-auto ${className}`}
      data-filled={filled}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={NEST_DOME} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {LAYER_Y.map((y, index) => (
          <rect
            key={y}
            data-layer={index + 1}
            data-filled={index < filled}
            x={0}
            y={y}
            width={120}
            height={LAYER_HEIGHT}
            style={{ fill: nestLayerFill(index, filled) }}
            className="transition-[fill] duration-300 ease-out motion-reduce:transition-none"
          />
        ))}
      </g>
      <path
        data-outline
        d={NEST_DOME}
        fill="none"
        stroke={NEST_OUTLINE}
        strokeWidth={1.4}
        strokeOpacity={0.7}
      />
      <ellipse cx={95} cy={46} rx={7} ry={9} fill={NEST_ENTRANCE} />
    </svg>
  );
}
