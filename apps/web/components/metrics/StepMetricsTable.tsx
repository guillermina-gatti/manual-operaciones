// The steps of one version: how many executions reached, finished and abandoned each step, and
// how long each one takes, with "Mayor tiempo" on the slowest. The last row is the whole
// procedure, from start to end. The bars are decorative: every value is written next to them.
import type { ReactNode } from 'react';
import type { VersionMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent, formatShare } from '@/lib/metrics/format';
import { stepRows } from '@/lib/metrics/steps';
import { TimeBar } from './FeatherBar';
import { TimerIcon } from './icons';

interface StepMetricsTableProps {
  version: VersionMetricsResponse;
  caption: string;
}

const HEAD = 'px-4 py-3 text-left text-sm font-semibold text-texto-suave';
const NUMBER = 'px-4 py-3 text-right tabular-nums';

export function StepMetricsTable({ version, caption }: StepMetricsTableProps) {
  const rows = stepRows(version.steps);

  return (
    // Wide tables scroll inside the card on a phone; the page itself never scrolls sideways.
    <div className="overflow-x-auto rounded-xl border border-borde">
      <table className="w-full min-w-[48rem] border-collapse text-texto">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-fondo">
          <tr>
            <th scope="col" className={HEAD}>
              Paso
            </th>
            <th scope="col" className={HEAD}>
              Descripción
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Llegaron
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Terminaron
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Abandonaron
            </th>
            <th scope="col" className={HEAD}>
              Tiempo medio del paso
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {rows.map((step) => (
            <tr key={step.stepId}>
              <td className="px-4 py-3">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-chip-area text-sm font-bold text-chip-area-texto">
                  {step.order}
                </span>
              </td>
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                <span className="flex flex-wrap items-center gap-2">
                  {step.title}
                  {step.slowest && <SlowestBadge />}
                </span>
              </th>
              <td className={NUMBER}>{formatCount(step.reached)}</td>
              <td className={`${NUMBER} font-bold`}>{formatCount(step.finished)}</td>
              <td className={NUMBER}>
                {formatCount(step.abandoned)}
                {step.abandoned > 0 && (
                  <span className="text-texto-suave"> ({formatPercent(step.abandonRate)})</span>
                )}
              </td>
              <td className="px-4 py-3">
                <TimeCell ratio={step.timeRatio}>
                  <span className="font-semibold">{formatDuration(step.avgDurationMs)}</span>
                  {step.timeShare !== null && (
                    <span className="text-sm text-texto-suave">
                      {formatShare(step.timeShare)} del total
                    </span>
                  )}
                </TimeCell>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-texto-suave/40 bg-fondo font-bold">
            <td className="px-4 py-3">
              <TimerIcon className="text-bosque" />
            </td>
            <th scope="row" className="px-4 py-3 text-left">
              Procedimiento completo
              <span className="font-normal text-texto-suave"> · de inicio a fin</span>
            </th>
            <td className={NUMBER}>{formatCount(version.started)}</td>
            <td className={NUMBER}>{formatCount(version.completed)}</td>
            <td className={NUMBER}>{formatCount(version.abandoned)}</td>
            {/* The average of the completed executions of this version, from start to end. */}
            <td className="px-4 py-3 text-bosque">{formatDuration(version.avgCompletionMs)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TimeCell({ ratio, children }: { ratio: number; children: ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <TimeBar ratio={ratio} />
      <span className="flex flex-col whitespace-nowrap tabular-nums">{children}</span>
    </span>
  );
}

// The slowest step of the procedure: icon and text, never the color alone.
function SlowestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-durazno px-2 py-0.5 text-xs font-semibold text-durazno-texto">
      <TimerIcon className="size-3.5" />
      Mayor tiempo
    </span>
  );
}
