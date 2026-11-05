// Rows of the steps table of one procedure version (HU38): what the design shows next to each
// step, computed from what the API gives. Pure.
import type { StepMetricsResponse } from '@/lib/api';

export interface StepRow extends StepMetricsResponse {
  // Reached it and neither finished nor abandoned it: still in progress in this step.
  inProgress: number;
  // Bar length: this step's average over the slowest step's, from 0 to 1.
  timeRatio: number;
  // This step's average over the sum of the averages of every step, from 0 to 1; null without
  // time.
  timeShare: number | null;
  // "Mayor tiempo": the step with the highest average time; on a tie, the first one.
  slowest: boolean;
}

export function stepRows(steps: StepMetricsResponse[]): StepRow[] {
  const times = steps.map((step) => step.avgDurationMs ?? 0);
  const longest = Math.max(0, ...times);
  const total = times.reduce((sum, time) => sum + time, 0);
  const slowestIndex = longest === 0 ? -1 : times.indexOf(longest);

  return steps.map((step, index) => ({
    ...step,
    inProgress: Math.max(step.reached - step.finished - step.abandoned, 0),
    timeRatio: step.avgDurationMs === null || longest === 0 ? 0 : step.avgDurationMs / longest,
    timeShare: step.avgDurationMs === null || total === 0 ? null : step.avgDurationMs / total,
    slowest: index === slowestIndex,
  }));
}
