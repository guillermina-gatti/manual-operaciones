// The steps of one version: how many executions reached, finished and abandoned each step, and
// how long each one takes, with "Mayor tiempo" on the slowest. The last row is the whole
// procedure, from start to end, under a bosque line.
//
// The head and cells of the other tables (activity-design.ts) in a frame of 14 px; every data
// column to the left, with tabular-nums, as in "Tiempo por procedimiento". Below lg each step is a
// card: the number, the description with its tag, "Llegaron: N", "Terminaron: N", "Abandonaron: N"
// and the time with its bar. The bars are decorative: every value is written next to them.
import type { VersionMetricsResponse } from '@/lib/api';
import {
  DONE_FILL,
  DONE_TRACK,
  ROW_LINE,
  SLOW_TAG,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TH,
} from '@/components/executions/activity-design';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent, formatShare } from '@/lib/metrics/format';
import { stepRows } from '@/lib/metrics/steps';
import type { StepRow } from '@/lib/metrics/steps';
import { TimerIcon } from './icons';
import { DATA_CELL, STEPS_FRAME, TOTAL_ROW } from './metrics-design';

interface StepMetricsTableProps {
  version: VersionMetricsResponse;
  caption: string;
}

// The card: the number in its column, everything else, one per line, to its right.
const LAYOUT =
  'max-lg:grid max-lg:grid-cols-[2.5rem_minmax(0,1fr)] max-lg:gap-x-3 max-lg:gap-y-1.5 max-lg:px-4 max-lg:py-4';
const ROW = `border-t ${ROW_LINE} first:border-t-0 ${LAYOUT}`;
const NUMBER_CELL = `${TABLE_TD} max-lg:row-span-5 max-lg:block`;
const NAME_CELL = `${TABLE_TD} text-left max-lg:col-start-2 max-lg:block max-lg:pb-1`;
// Every data cell shares this: to the left, with tabular-nums.
const CELL = `${DATA_CELL} max-lg:col-start-2 max-lg:block`;
// "Llegaron: " and the others, only on the card.
const CARD_LABEL = 'text-sm font-normal text-texto-suave lg:hidden';

export function StepMetricsTable({ version, caption }: StepMetricsTableProps) {
  const rows = stepRows(version.steps);

  return (
    <div className={STEPS_FRAME}>
      <table className="w-full border-collapse text-texto max-lg:block lg:table-fixed">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[76px]" />
          <col />
          <col className="w-[110px]" />
          <col className="w-[120px]" />
          <col className="w-[130px]" />
          <col className="w-[230px]" />
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
          <tr className={`${LAYOUT} ${TOTAL_ROW} font-bold`}>
            <td className={NUMBER_CELL}>
              <TimerIcon className="text-bosque" />
            </td>
            <th scope="row" className={NAME_CELL}>
              Procedimiento completo
              <span className="font-normal text-texto-suave"> · de inicio a fin</span>
            </th>
            <td className={CELL}>
              <span className={CARD_LABEL}>Llegaron: </span>
              {formatCount(version.started)}
            </td>
            <td className={CELL}>
              <span className={CARD_LABEL}>Terminaron: </span>
              {formatCount(version.completed)}
            </td>
            <td className={CELL}>
              <span className={CARD_LABEL}>Abandonaron: </span>
              {formatCount(version.abandoned)}
            </td>
            {/* The average of the completed executions of this version, from start to end. */}
            <td className={`${CELL} text-bosque`}>
              <span className={CARD_LABEL}>Tiempo medio: </span>
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
        <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-chip-area text-sm font-bold text-chip-area-texto">
          {step.order}
        </span>
      </td>
      <th scope="row" className={`${NAME_CELL} text-[15px] font-bold`}>
        <span className="flex flex-wrap items-center gap-2 break-words">
          {step.title}
          {step.slowest && (
            <span className={`${SLOW_TAG} gap-1`}>
              <TimerIcon className="size-3.5" />
              Mayor tiempo
            </span>
          )}
        </span>
      </th>
      <td className={CELL}>
        <span className={CARD_LABEL}>Llegaron: </span>
        {formatCount(step.reached)}
      </td>
      <td className={`${CELL} font-bold`}>
        <span className={CARD_LABEL}>Terminaron: </span>
        {formatCount(step.finished)}
      </td>
      <td className={`${CELL} text-texto-suave`}>
        <span className={CARD_LABEL}>Abandonaron: </span>
        {formatCount(step.abandoned)}
        {step.abandoned > 0 && <> ({formatPercent(step.abandonRate)})</>}
      </td>
      <td className={CELL}>
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[15px] font-bold whitespace-nowrap">
            {formatDuration(step.avgDurationMs)}
          </span>
          {step.timeShare !== null && (
            <span className="text-[13px] whitespace-nowrap text-texto-suave">
              · {formatShare(step.timeShare).replace(/%$/, ' %')} del total
            </span>
          )}
        </span>
        {step.timeShare !== null && (
          <span
            aria-hidden="true"
            data-testid="step-time-bar"
            className={`mt-1.5 block h-2 w-full overflow-hidden rounded-full lg:max-w-[190px] ${DONE_TRACK}`}
          >
            <span
              className={`block h-full rounded-full ${step.slowest ? 'bg-naranja' : DONE_FILL}`}
              // Its share of the whole procedure, at least 2 % so it never looks like nothing.
              style={{ width: `${Math.max(2, step.timeShare * 100)}%` }}
            />
          </span>
        )}
      </td>
    </tr>
  );
}
