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

  return (
    <div className="flex flex-col gap-2">
      <p aria-live="polite" className="font-medium">
        {currentNumber === null ? finishedText : `Paso ${currentNumber} de ${total}`}
      </p>
      <div
        role="progressbar"
        aria-label="Pasos terminados"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finishedCount}
        aria-valuetext={finishedText}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
      >
        <div
          className="h-full rounded-full bg-blue-700 transition-[width] dark:bg-blue-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
