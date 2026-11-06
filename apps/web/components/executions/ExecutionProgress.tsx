// The progress card: "Paso 2 de 4" and the percentage done, over a bar of one segment per step
// (the design's "progreso por segmentos"): finished in bosque, the current one in orange, pending in
// gray. The bar is a progressbar with the finished steps as text, and the title is a live region,
// so a screen reader hears the new step after each one is completed. Nothing is told by color
// alone: the text says the step and the percentage.
import { CARD } from '@/components/documents/design';
import type { ExecutionSummary } from '@/lib/executions/summary';

interface ExecutionProgressProps {
  summary: ExecutionSummary;
}

export function ExecutionProgress({ summary }: ExecutionProgressProps) {
  const { total, finishedCount, currentNumber } = summary;
  const finishedText = `${finishedCount} de ${total} pasos terminados`;
  const percent = total === 0 ? 0 : Math.round((finishedCount / total) * 100);
  const done = currentNumber === null;

  return (
    <section className={`${CARD} flex flex-col gap-4 p-6 sm:p-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 aria-live="polite" className="text-[22px] font-bold text-texto">
          {done ? 'Procedimiento terminado' : `Paso ${currentNumber} de ${total}`}
        </h2>
        <p className="text-texto-suave">
          <strong className="font-bold text-texto">{percent}%</strong> completado
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Pasos terminados"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finishedCount}
        aria-valuetext={finishedText}
        className="flex h-3 w-full gap-1"
      >
        {Array.from({ length: total }, (_, index) => {
          const number = index + 1;
          const state =
            number <= finishedCount ? 'done' : number === currentNumber ? 'current' : 'pending';
          return (
            <span
              key={number}
              data-state={state}
              className={`h-full min-w-0 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${SEGMENT[state]}`}
            />
          );
        })}
      </div>
    </section>
  );
}

const SEGMENT = {
  done: 'bg-bosque',
  current: 'bg-naranja',
  pending: 'bg-borde',
} as const;
