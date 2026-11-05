// The steps of one version: how many reached and finished each one, its average time and its
// abandonment. The abandonment bar is a single-hue meter next to its written value, so it is
// never read from color alone; the table is the accessible view.
import type { StepMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent } from '@/lib/metrics/format';

interface StepMetricsTableProps {
  steps: StepMetricsResponse[];
  caption: string;
}

const HEAD = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300';
const NUMBER = 'px-4 py-3 text-right tabular-nums';

export function StepMetricsTable({ steps, caption }: StepMetricsTableProps) {
  return (
    // Wide tables scroll inside the card on a phone; the page itself never scrolls sideways.
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm text-zinc-800 dark:text-zinc-200">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-zinc-50 dark:bg-zinc-800/60">
          <tr>
            <th scope="col" className={HEAD}>
              Paso
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Llegaron
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Terminaron
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Tiempo medio
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Abandonos
            </th>
            <th scope="col" className={HEAD}>
              Abandono
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {steps.map((step) => (
            <tr key={step.stepId}>
              <th scope="row" className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  {step.order}
                </span>
                {step.title}
              </th>
              <td className={NUMBER}>{formatCount(step.reached)}</td>
              <td className={NUMBER}>{formatCount(step.finished)}</td>
              <td className={NUMBER}>{formatDuration(step.avgDurationMs)}</td>
              <td className={NUMBER}>{formatCount(step.abandoned)}</td>
              <td className="px-4 py-3">
                <AbandonMeter rate={step.abandonRate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbandonMeter({ rate }: { rate: number | null }) {
  const percent = rate === null ? 0 : Math.round(rate * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-right font-medium tabular-nums">{formatPercent(rate)}</span>
      {rate !== null && (
        <span
          aria-hidden="true"
          className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950"
        >
          <span
            className="block h-full rounded-full bg-amber-600 dark:bg-amber-400"
            // At least a sliver when there is any abandonment, so it never looks like zero.
            style={{ width: percent === 0 ? 0 : `max(4px, ${percent}%)` }}
          />
        </span>
      )}
    </div>
  );
}
