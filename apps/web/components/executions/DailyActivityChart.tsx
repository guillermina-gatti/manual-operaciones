'use client';

// "Actividad diaria", at the end of Mi actividad: the executions completed on each of the last 21
// days, stacked by procedure. It follows the area of the filters but never their dates: the window
// is always the last 21 days (GET /metrics/me/daily). Its own request, with its own loading, error
// and empty states, so a failure never breaks the rest of the page.
//
// The yellow and the aqua have little contrast with white, so the legend, the box of each day and
// the table are always there; texts never take the color of a series.
import Link from 'next/link';
import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { describeMyMetricsError, getMyDailyActivity, useApiResource } from '@/lib/api';
import type { ApiResource, MyDailyActivityResponse } from '@/lib/api';
import {
  axisDay,
  chartDays,
  chartSeries,
  dayAriaLabel,
  dayBoxTitle,
  showsAxisLabel,
  tableDay,
  yScale,
} from '@/lib/executions/daily-chart';
import type { ChartDay, ChartSeries } from '@/lib/executions/daily-chart';
import { formatShortPeriod } from '@/lib/executions/my-activity';
import { formatCount } from '@/lib/metrics/format';
import { useSession } from '@/lib/session';
import { ACTIVITY_CARD, CHART_AXIS_TEXT, CHART_GRID, CHART_TEXT_STRONG } from './nest-design';

const CARD_PADDING = 'px-5 py-6 md:px-7 md:py-[26px]';
// Secondary, 40 px: border bosque of 1,5 px.
const TOGGLE_BUTTON =
  'inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-bosque bg-blanco px-4 text-sm font-semibold text-bosque transition hover:bg-salvia active:translate-y-px aria-pressed:bg-salvia motion-reduce:transition-none motion-reduce:active:translate-y-0';
const START_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-bosque px-4 text-sm font-semibold text-blanco transition hover:bg-bosque-hover active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0';
const RETRY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl border-[1.5px] border-bosque bg-blanco px-4 text-sm font-semibold text-bosque transition hover:bg-salvia active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0';

// The drawing: viewBox 1120 × 300 and its margins.
const WIDTH = 1120;
const HEIGHT = 300;
const MARGIN = { left: 44, right: 10, top: 16, bottom: 34 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const BASELINE = HEIGHT - MARGIN.bottom;
const BAR_WIDTH = 36;
const RADIUS = 5;
// Between two stacked segments, in the color of the card.
const SEGMENT_GAP = 2;
// The axis text: 12 px on a computer; the phone shows the drawing at about half its size, so the
// text doubles to stay at 12 px.
const AXIS_TEXT = 'text-[12px] max-md:text-[24px]';

interface DailyActivityChartProps {
  // The area of the filters of the page; null for all their areas.
  areaId: string | null;
}

export function DailyActivityChart({ areaId }: DailyActivityChartProps) {
  const { user } = useSession();
  const state = useApiResource(
    user ? `my-daily-chart:${user.id}:${areaId ?? 'todas'}` : null,
    (signal) => getMyDailyActivity(areaId, signal),
  );
  return <DailyActivityChartView state={state} />;
}

export function DailyActivityChartView({ state }: { state: ApiResource<MyDailyActivityResponse> }) {
  const headingId = useId();
  const [asTable, setAsTable] = useState(false);
  const data = state.status === 'success' ? state.data : null;
  const empty = data ? data.days.every((day) => day.procedures.length === 0) : false;

  return (
    <section aria-labelledby={headingId} className={`${ACTIVITY_CARD} ${CARD_PADDING} flex min-w-0 flex-col gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="text-xl font-bold text-texto">
            Actividad diaria
          </h2>
          <p className="text-sm text-texto-suave">
            Ejecuciones completadas por día, apiladas por procedimiento. Últimos 21 días
            {data && <> ({formatShortPeriod(data.windowFrom, data.windowTo)})</>}; no cambia con las
            fechas del filtro.
          </p>
        </div>
        {data && !empty && (
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((value) => !value)}
            className={TOGGLE_BUTTON}
          >
            Ver como tabla
          </button>
        )}
      </div>
      <ChartBody state={state} asTable={asTable} />
    </section>
  );
}

function ChartBody({ state, asTable }: { state: ApiResource<MyDailyActivityResponse>; asTable: boolean }) {
  if (state.status === 'error') {
    const { message, canRetry } = describeMyMetricsError(state.error);
    return (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="alert" className="text-sm text-texto">
          No se pudo cargar tu actividad diaria. {message}
        </p>
        {canRetry && (
          <button type="button" onClick={state.reload} className={RETRY_BUTTON}>
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (state.status !== 'success') {
    return (
      <div role="status" aria-busy="true" aria-live="polite" data-testid="daily-chart-loading">
        <p className="sr-only">Cargando tu actividad diaria…</p>
        <div aria-hidden="true" className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none">
          <div className="aspect-[1120/300] w-full rounded-xl bg-borde max-md:aspect-auto max-md:h-40" />
          <div className="h-4 w-2/3 rounded bg-borde" />
        </div>
      </div>
    );
  }

  const days = state.data.days;
  if (days.every((day) => day.procedures.length === 0)) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-texto">Todavía no completaste ejecuciones en los últimos 21 días.</p>
        <Link href="/ejecuciones" className={START_BUTTON}>
          Elegir un procedimiento
        </Link>
      </div>
    );
  }

  const series = chartSeries(days);
  const chart = chartDays(days, series);
  return (
    <>
      {asTable ? <ChartTable days={chart} series={series} /> : <StackedChart days={chart} />}
      <Legend series={series} />
    </>
  );
}

// --- The chart -------------------------------------------------------------------------------------

const slot = PLOT_WIDTH / 21;
const columnX = (index: number) => MARGIN.left + index * slot + (slot - BAR_WIDTH) / 2;

// A rectangle with only its top corners rounded.
function roundedTop(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height, width / 2);
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    'Z',
  ].join(' ');
}

function StackedChart({ days }: { days: ChartDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const { top, ticks } = yScale(Math.max(0, ...days.map((day) => day.total)));
  const yOf = (value: number) => BASELINE - (value / top) * PLOT_HEIGHT;
  const activeDay = active === null ? null : days[active];

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setActive(null);
  };

  return (
    // Only the drawing scrolls sideways on a phone; the page never does.
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="relative min-w-[560px]" onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-label="Gráfico de ejecuciones completadas por día"
          className="block h-auto w-full overflow-visible"
          data-testid="daily-chart"
        >
          <g aria-hidden="true">
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={yOf(tick)}
                  y2={yOf(tick)}
                  stroke={CHART_GRID}
                  strokeWidth={1}
                  data-grid
                />
                <text
                  x={MARGIN.left - 10}
                  y={yOf(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={CHART_AXIS_TEXT}
                  className={AXIS_TEXT}
                  data-y-tick
                >
                  {tick}
                </text>
              </g>
            ))}
            {days.map((day, index) => {
              const desktop = showsAxisLabel(index, 2);
              const phone = showsAxisLabel(index, 3);
              if (!desktop && !phone) return null;
              const visibility = desktop && phone ? '' : desktop ? 'max-md:hidden' : 'md:hidden';
              return (
                <text
                  key={day.date}
                  x={columnX(index) + BAR_WIDTH / 2}
                  y={HEIGHT - 10}
                  textAnchor="middle"
                  fill={CHART_AXIS_TEXT}
                  className={`${AXIS_TEXT} ${visibility}`}
                  data-x-label={day.date}
                >
                  {axisDay(day.date)}
                </text>
              );
            })}
          </g>

          {activeDay && active !== null && (
            <rect
              aria-hidden="true"
              x={columnX(active) - 6}
              y={MARGIN.top}
              width={BAR_WIDTH + 12}
              height={PLOT_HEIGHT}
              rx={6}
              className="fill-salvia"
            />
          )}

          {days.map((day, index) => (
            <g key={day.date} aria-hidden="true" data-day={day.date} data-total={day.total}>
              {stackSegments(day, yOf).map((segment) => (
                <path
                  key={segment.key}
                  d={
                    segment.top
                      ? roundedTop(columnX(index), segment.y, BAR_WIDTH, segment.height)
                      : `M${columnX(index)},${segment.y + segment.height} V${segment.y} H${columnX(index) + BAR_WIDTH} V${segment.y + segment.height} Z`
                  }
                  fill={segment.color}
                  data-segment={segment.key}
                  data-count={segment.count}
                />
              ))}
            </g>
          ))}

          {/* A zone per day with data, the whole height of the column: hover, focus and Escape. */}
          {days.map((day, index) =>
            day.total === 0 ? null : (
              <rect
                key={day.date}
                role="img"
                tabIndex={0}
                aria-label={dayAriaLabel(day)}
                x={columnX(index) - 6}
                y={MARGIN.top}
                width={BAR_WIDTH + 12}
                height={PLOT_HEIGHT}
                rx={6}
                fill="transparent"
                className="outline-none focus-visible:stroke-naranja focus-visible:[stroke-width:2]"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onKeyDown={onKeyDown}
                data-focus-zone={day.date}
              />
            ),
          )}
        </svg>

        {activeDay && active !== null && <DayBox day={activeDay} index={active} />}
      </div>
    </div>
  );
}

interface Segment {
  key: string;
  color: string;
  count: number;
  y: number;
  height: number;
  top: boolean;
}

// From the bottom up, in the order of the series; each one above the first leaves 2 px of card
// below it, and only the top one has rounded corners.
function stackSegments(day: ChartDay, yOf: (value: number) => number): Segment[] {
  const present = day.segments.filter((segment) => segment.count > 0);
  let below = 0;
  return present.map((segment, index) => {
    const bottom = yOf(below) - (index > 0 ? SEGMENT_GAP : 0);
    below += segment.count;
    const y = yOf(below);
    return {
      key: segment.key,
      color: segment.color,
      count: segment.count,
      y,
      height: Math.max(bottom - y, 0.5),
      top: index === present.length - 1,
    };
  });
}

// The box of a day, beside its column so it never covers the bars it tells: on the right of a
// column of the first half, on the left of one of the second half.
function DayBox({ day, index }: { day: ChartDay; index: number }) {
  const firstHalf = index < 11;
  const edge = firstHalf ? columnX(index) + BAR_WIDTH + 12 : columnX(index) - 12;
  const align = firstHalf ? 'translate-x-0' : '-translate-x-full';
  return (
    <div
      role="tooltip"
      data-testid="day-box"
      style={{ left: `${(edge / WIDTH) * 100}%` }}
      className={`pointer-events-none absolute top-1 z-10 w-max max-w-64 ${align} rounded-xl border border-[#DDE3DE] bg-blanco px-3 py-2.5 shadow-[0_4px_16px_rgba(11,66,51,0.12)]`}
    >
      <p className={`text-sm font-bold ${CHART_TEXT_STRONG}`}>{dayBoxTitle(day)}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {day.details.map((detail) => (
          <li key={detail.procedureId} className="flex items-center gap-2 text-sm text-[#4F6B60]">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: detail.color }}
            />
            <span className="min-w-0 flex-1 truncate">{detail.name}</span>
            <span className={`font-semibold tabular-nums ${CHART_TEXT_STRONG}`}>
              {formatCount(detail.completed)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Procedimientos del gráfico" className="flex flex-wrap gap-x-5 gap-y-2">
        {series.map((item) => (
          <li key={item.key} className={`flex items-center gap-2 text-sm ${CHART_TEXT_STRONG}`}>
            <span
              aria-hidden="true"
              data-legend-swatch={item.key}
              className="size-3 shrink-0 rounded-[3px]"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-texto-suave">Los días sin barra no tuvieron ejecuciones completadas.</p>
    </div>
  );
}

// The same numbers as the chart: one row per day, one column per series and the total.
function ChartTable({ days, series }: { days: ChartDay[]; series: ChartSeries[] }) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#DDE3DE]">
      <table className="w-full min-w-[480px] text-left text-sm">
        <caption className="sr-only">Ejecuciones completadas por día y por procedimiento</caption>
        <thead className="bg-[#E6EFE9] text-[#2C4B41]">
          <tr>
            <th scope="col" className="px-4 py-3 text-xs font-bold uppercase">
              Día
            </th>
            {series.map((item) => (
              <th key={item.key} scope="col" className="px-4 py-3 text-xs font-bold uppercase">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-right text-xs font-bold uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date} className="border-t border-[#EEF0EC]">
              <th scope="row" className="px-4 py-2.5 font-semibold whitespace-nowrap text-texto">
                {tableDay(day.date)}
              </th>
              {day.segments.map((segment) => (
                <td key={segment.key} className="px-4 py-2.5 text-texto tabular-nums">
                  {formatCount(segment.count)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-bold text-texto tabular-nums">
                {formatCount(day.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
