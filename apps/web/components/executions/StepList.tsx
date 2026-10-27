// The steps of the execution, in order. Each one is finished, current or pending; only the current
// one has the button to finish it.
import { Button } from '@/components/ui/Button';
import type { ExecutionResponse, ExecutionStepResponse } from '@/lib/api';
import { formatDuration, formatTime } from '@/lib/executions/format';

type StepState = 'finished' | 'current' | 'pending';

interface StepListProps {
  execution: ExecutionResponse;
  // True while the current step is being saved.
  completing: boolean;
  onComplete: (stepId: string) => void;
  // After finishing a step in this screen, the focus moves to the button of the next one.
  focusCurrent: boolean;
}

const STATE_LABELS: Record<StepState, string> = {
  finished: 'Terminado',
  current: 'En curso',
  pending: 'Pendiente',
};

const ITEM_STYLES: Record<StepState, string> = {
  finished: 'border-zinc-200 dark:border-zinc-700',
  current: 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950',
  pending: 'border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400',
};

const BADGE_STYLES: Record<StepState, string> = {
  finished: 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
  current: 'bg-blue-700 text-white dark:bg-blue-500 dark:text-zinc-950',
  pending: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
};

export function StepList({ execution, completing, onComplete, focusCurrent }: StepListProps) {
  return (
    <ol aria-label="Pasos" className="flex flex-col gap-3">
      {execution.steps.map((step) => {
        const state = stateOf(step, execution.currentStepId);
        return (
          <li
            key={step.stepId}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex min-w-0 flex-col gap-3 rounded-lg border p-4 ${ITEM_STYLES[state]}`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${BADGE_STYLES[state]}`}
              >
                {state === 'finished' ? '✓' : step.order}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="break-words font-medium">
                  <span className="sr-only">Paso {step.order}: </span>
                  {step.title}
                </h2>
                <p className="text-sm">
                  <span className="font-medium">{STATE_LABELS[state]}</span>
                  <StepTimes step={step} state={state} />
                </p>
              </div>
            </div>
            {state === 'current' && (
              <Button
                className="self-start"
                disabled={completing}
                autoFocus={focusCurrent}
                onClick={() => onComplete(step.stepId)}
              >
                {completing ? 'Guardando…' : 'Terminé este paso'}
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepTimes({ step, state }: { step: ExecutionStepResponse; state: StepState }) {
  if (state === 'finished' && step.finishedAt) {
    return (
      <>
        {' · '}
        {formatDuration(step.durationMs)}
        {' · '}Terminó a las {formatTime(step.finishedAt)}
      </>
    );
  }
  if (state === 'current' && step.startedAt) {
    return <> · Empezó a las {formatTime(step.startedAt)}</>;
  }
  return null;
}

function stateOf(step: ExecutionStepResponse, currentStepId: string | null): StepState {
  if (step.finishedAt !== null) return 'finished';
  if (step.stepId === currentStepId) return 'current';
  return 'pending';
}
