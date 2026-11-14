// The progress card: the hornero's nest, one layer per step (the design's "Tu nido va tomando
// forma"), and the finished steps as text. The nest is decorative; the progressbar around it
// tells the finished steps, and a live region announces the new step after each one is completed.
// Nothing is told by color alone: the text says how many steps are done.
import { CARD } from '@/components/documents/design';
import type { ExecutionSummary } from '@/lib/executions/summary';
import { ProgressNest } from './ProgressNest';

interface ExecutionProgressProps {
  summary: ExecutionSummary;
}

export function ExecutionProgress({ summary }: ExecutionProgressProps) {
  const { total, finishedCount, currentNumber } = summary;
  const done = currentNumber === null;

  return (
    <section className={`${CARD} flex items-center gap-4 p-5 sm:gap-6 sm:p-6`}>
      <div
        role="progressbar"
        aria-label="Pasos terminados"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finishedCount}
        aria-valuetext={`${finishedCount} de ${total} pasos terminados`}
        className="w-24 shrink-0 sm:w-36"
      >
        <ProgressNest total={total} finishedCount={finishedCount} currentNumber={currentNumber} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-lg font-bold leading-snug text-bosque sm:text-[22px]">
          Tu nido va tomando forma
        </h2>
        <p className="text-texto-suave">
          <strong className="font-bold text-texto tabular-nums">
            {finishedCount} de {total}
          </strong>{' '}
          pasos hechos
        </p>
        {/* For screen readers: the new step, announced after each one is finished. */}
        <p aria-live="polite" className="sr-only">
          {done ? 'Procedimiento terminado' : `Paso ${currentNumber} de ${total}`}
        </p>
      </div>
    </section>
  );
}
