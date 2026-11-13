// The steps of one version: how many executions reached, finished and abandoned each step, and
// how long each one takes, with "Mayor tiempo" on the slowest. The last row is the whole
// procedure, from start to end, under a bosque line.
//
// The frame, head and cells of the other tables (activity-design.ts); every data column to the
// left, as in "Tiempo por procedimiento". Below lg each step is a card: the number and the
// description, then reached, finished and abandoned side by side, then the time. The bars are
// decorative: every value is written next to them.
import type { VersionMetricsResponse } from '@/lib/api';
import {
  DONE_FILL,
  DONE_TRACK,
  ROW_LINE,
  TABLE_FRAME,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TH,
} from '@/components/executions/activity-design';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent, formatShare } from '@/lib/metrics/format';
import { stepRows } from '@/lib/metrics/steps';
import type { StepRow } from '@/lib/metrics/steps';
import { TimerIcon } from './icons';
import { DATA_CELL } from './metrics-design';

interface StepMetricsTableProps {
  version: VersionMetricsResponse;
  caption: string;
}

// The card: the number in its column, everything else in the three to its right.
// On the card the three counts share a narrow row: their names without capitals, so "Abandonaron"
// fits on a phone.
const STEP_LABEL = 'block text-xs font-semibold text-texto-suave lg:hidden';
const LAYOUT = `max-lg:grid max-lg:grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] max-lg:gap-x-3 max-lg:gap-y-3 max-lg:px-4 max-lg:py-4`;
const ROW = `border-t ${ROW_LINE} first:border-t-0 ${LAYOUT}`;
const NUMBER_CELL = `${TABLE_TD} max-lg:row-span-3 max-lg:block`;
const NAME_CELL = `${TABLE_TD} text-left max-lg:col-span-3 max-lg:block`;
const COUNT_CELL = `${DATA_CELL} max-lg:block`;
const TIME_CELL = `${DATA_CELL} max-lg:col-span-3 max-lg:col-start-2 max-lg:block`;

export function StepMetricsTable({ version, caption }: StepMetricsTableProps) {
  const rows = stepRows(version.steps);

  return (
    <div className={`${TABLE_FRAME} overflow-hidden`}>
      <table className="w-full border-collapse text-texto max-lg:block lg:table-fixed">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[76px]" />
          <col />
          <col className="w-[110px]" />
          <col className="w-[120px]" />
          <col className="w-[130px]" />
          <col className="w-[220px]" />
        </colgroup>
        <thead className={`${TABLE_HEAD} max-lg:hidden`}>
          <tr>
            <th scope="col" className={TABLE_TH}>
              Paso
            </th>
            <th scope="col" className={TABLE_TH}>
              Descripción
            </th>
            <th scope="col" className={TABLE_TH}>
              Llegaron
            </th>
            <th scope="col" className={TABLE_TH}>
              Terminaron
            </th>
            <th scope="col" className={TABLE_TH}>
              Abandonaron
            </th>
            <th scope="col" className={TABLE_TH}>
              Tiempo medio del paso
            </th>
          </tr>
        </thead>
        <tbody className="max-lg:block">
          {rows.map((step) => (
            <StepRowView key={step.stepId} step={step} />
          ))}
        </tbody>
        <tfoot className="max-lg:block">
          <tr className={`${LAYOUT} border-t-2 border-bosque bg-fondo font-bold`}>
            <td className={NUMBER_CELL}>
              <TimerIcon className="text-bosque" />
            </td>
            <th scope="row" className={NAME_CELL}>
              Procedimiento completo
              <span className="font-normal text-texto-suave"> · de inicio a fin</span>
            </th>
            <td className={COUNT_CELL}>
              <span className={STEP_LABEL}>Llegaron</span>
              {formatCount(version.started)}
            </td>
            <td className={COUNT_CELL}>
              <span className={STEP_LABEL}>Terminaron</span>
              {formatCount(version.completed)}
            </td>
            <td className={COUNT_CELL}>
              <span className={STEP_LABEL}>Abandonaron</span>
              {formatCount(version.abandoned)}
            </td>
            {/* The average of the completed executions of this version, from start to end. */}
            <td className={`${TIME_CELL} text-bosque`}>
              <span className={STEP_LABEL}>Tiempo medio</span>
              {formatDuration(version.avgCompletionMs)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StepRowView({ step }: { step: StepRow }) {
  return (
    <tr className={ROW}>
      <td className={NUMBER_CELL}>
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-chip-area text-sm font-bold text-chip-area-texto">
          {step.order}
        </span>
      </td>
      <th scope="row" className={`${NAME_CELL} font-semibold`}>
        <span className="flex flex-wrap items-center gap-2 break-words">
          {step.title}
          {step.slowest && <SlowestBadge />}
        </span>
      </th>
      <td className={COUNT_CELL}>
        <span className={STEP_LABEL}>Llegaron</span>
        {formatCount(step.reached)}
      </td>
      <td className={`${COUNT_CELL} font-bold`}>
        <span className={STEP_LABEL}>Terminaron</span>
        {formatCount(step.finished)}
      </td>
      <td className={COUNT_CELL}>
        <span className={STEP_LABEL}>Abandonaron</span>
        {formatCount(step.abandoned)}
        {step.abandoned > 0 && (
          <span className="text-texto-suave"> ({formatPercent(step.abandonRate)})</span>
        )}
      </td>
      <td className={TIME_CELL}>
        <span className={STEP_LABEL}>Tiempo medio del paso</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold whitespace-nowrap">
            {formatDuration(step.avgDurationMs)}
          </span>
          {step.timeShare !== null && (
            <span className="text-sm whitespace-nowrap text-texto-suave">
              {formatShare(step.timeShare)} del total
            </span>
          )}
        </span>
        {step.timeShare !== null && (
          <span
            aria-hidden="true"
            data-testid="step-time-bar"
            className={`mt-1.5 block h-2 w-full overflow-hidden rounded-full lg:max-w-[180px] ${DONE_TRACK}`}
          >
            <span
              className={`block h-full rounded-full ${step.slowest ? 'bg-naranja' : DONE_FILL}`}
              // Its share of the whole procedure, at least 3 % so it never looks like nothing.
              style={{ width: `${Math.max(3, step.timeShare * 100)}%` }}
            />
          </span>
        )}
      </td>
    </tr>
  );
}

// The slowest step of the procedure: icon and text, never the color alone.
function SlowestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-durazno px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-durazno-texto">
      <TimerIcon className="size-3.5" />
      Mayor tiempo
    </span>
  );
}
