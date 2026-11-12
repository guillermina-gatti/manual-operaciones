// The closing of an execution: the whole nest, "¡Terminaste …!", the total time and the step that
// took longest, and three ways out. Salvia, as the design's success screen, with the team's
// hornero. A status, so screen readers announce it once the last step is finished.
import Image from 'next/image';
import Link from 'next/link';
import { useId } from 'react';
import { TEXT_LINK } from '@/components/documents/design';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import { formatDuration } from '@/lib/executions/format';
import { MY_ACTIVITY_PATH } from '@/lib/executions/my-activity';
import { ProgressNest } from './ProgressNest';

interface CompletedPanelProps {
  procedureName: string;
  totalSteps: number;
  // From the start of the execution to its end; null if the API does not give the end.
  totalDurationMs: number | null;
  // The step that took longest; null when the API gives no duration per step.
  slowestStep: { title: string; durationMs: number } | null;
}

export function CompletedPanel({
  procedureName,
  totalSteps,
  totalDurationMs,
  slowestStep,
}: CompletedPanelProps) {
  const titleId = useId();

  return (
    <section
      role="status"
      aria-labelledby={titleId}
      className="relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-bosque/15 bg-salvia p-6 sm:p-8"
    >
      <Image
        src="/hornero.png"
        alt=""
        width={352}
        height={465}
        className="pointer-events-none absolute top-4 right-4 h-auto w-14 select-none sm:top-6 sm:right-6 sm:w-20"
      />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="self-start rounded-2xl bg-blanco p-4 shadow-sm sm:self-center sm:p-5">
          <ProgressNest
            total={totalSteps}
            finishedCount={totalSteps}
            currentNumber={null}
            className="w-32 sm:w-40"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:pr-24">
          <p className="text-sm font-semibold tracking-wide text-chip-area-texto uppercase">
            Nido terminado · {totalSteps} de {totalSteps} pasos
          </p>
          <h2
            id={titleId}
            className="text-2xl leading-tight font-extrabold tracking-[-0.01em] break-words text-bosque sm:text-[32px]"
          >
            ¡Terminaste {procedureName}!
          </h2>
          {totalDurationMs !== null && (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-4xl leading-none font-extrabold tracking-[-0.02em] text-bosque tabular-nums sm:text-5xl">
                {formatDuration(totalDurationMs)}
              </span>{' '}
              <span className="text-lg text-texto-suave">en total</span>
            </p>
          )}
          {slowestStep && (
            <p className="break-words text-texto">
              El paso que más te llevó: <strong className="font-bold">{slowestStep.title}</strong>{' '}
              <span className="whitespace-nowrap tabular-nums">
                ({formatDuration(slowestStep.durationMs)})
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link href="/ejecuciones" className={LIST_BUTTON_PRIMARY}>
          Ver otro procedimiento<span aria-hidden="true"> →</span>
        </Link>
        <Link href={MY_ACTIVITY_PATH} className={LIST_BUTTON_SECONDARY}>
          Ver mi actividad
        </Link>
        <Link href="/" className={`${TEXT_LINK} self-center px-2 py-3 sm:ml-2`}>
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
