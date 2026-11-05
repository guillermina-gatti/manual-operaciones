// "Paso 2 de 4" and a bar with the finished steps. The text is a live region, so a screen reader
// hears the new step after each one is completed.
import type { ExecutionSummary } from '@/lib/executions/summary';

interface ExecutionProgressProps {
  summary: ExecutionSummary;
}

export function ExecutionProgress({ summary }: ExecutionProgressProps) {
  const { total, finishedCount, currentNumber } = summary;
  const finishedText = `${finishedCount} de ${total} pasos terminados`;
  const percent = total === 0 ? 0 : Math.round((finishedCount / total) * 100);
  // Blue while in progress, green once every step is finished.
  const done = currentNumber === null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p aria-live="polite" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {done ? finishedText : `Paso ${currentNumber} de ${total}`}
      </p>
      <div
        role="progressbar"
        aria-label="Pasos terminados"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finishedCount}
        aria-valuetext={finishedText}
        className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
      >
        <div
          className={`h-full rounded-full bg-linear-to-r transition-[width] duration-500 ${
            done
              ? 'from-green-600 to-green-500 dark:from-green-500 dark:to-green-400'
              : 'from-blue-700 to-blue-500 dark:from-blue-500 dark:to-blue-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
