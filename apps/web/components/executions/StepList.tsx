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
  finished:
    'border-green-200 bg-white shadow-sm dark:border-green-900 dark:bg-zinc-900',
  current:
    'border-blue-600 bg-blue-50 shadow-md ring-4 ring-blue-600/10 dark:border-blue-400 dark:bg-blue-950/70 dark:ring-blue-400/15',
  pending:
    'border-zinc-200 bg-zinc-100/70 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400',
};

// The numbered circle: a check when finished.
const CIRCLE_STYLES: Record<StepState, string> = {
  finished: 'bg-green-700 text-white dark:bg-green-500 dark:text-zinc-950',
  current: 'bg-blue-700 text-white shadow-sm dark:bg-blue-400 dark:text-zinc-950',
  pending: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
};

// The small state label next to the times.
const LABEL_STYLES: Record<StepState, string> = {
  finished: 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200',
  current: 'bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-100',
  pending: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const TITLE_STYLES: Record<StepState, string> = {
  finished: 'text-zinc-900 dark:text-zinc-50',
  current: 'text-zinc-900 dark:text-zinc-50',
  pending: 'text-zinc-700 dark:text-zinc-300',
};

export function StepList({ execution, completing, onComplete, focusCurrent }: StepListProps) {
  return (
    <ol aria-label="Pasos" className="flex flex-col gap-4">
      {execution.steps.map((step) => {
        const state = stateOf(step, execution.currentStepId);
        return (
          <li
            key={step.stepId}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex min-w-0 flex-col gap-4 rounded-xl border p-5 transition-colors sm:p-6 ${ITEM_STYLES[state]}`}
          >
            <div className="flex min-w-0 items-start gap-4">
              <span
                aria-hidden="true"
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${CIRCLE_STYLES[state]}`}
              >
                {state === 'finished' ? '✓' : step.order}
              </span>
              <div className="flex min-w-0 flex-col gap-2 pt-1.5">
                <h2 className={`break-words text-lg font-semibold leading-snug ${TITLE_STYLES[state]}`}>
                  <span className="sr-only">Paso {step.order}: </span>
                  {step.title}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  <span
                    className={`mr-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${LABEL_STYLES[state]}`}
                  >
                    {STATE_LABELS[state]}
                  </span>
                  <StepTimes step={step} state={state} />
                </p>
              </div>
            </div>
            {state === 'current' && (
              <Button
                // `!` wins over Button's own size classes without editing it; still at least 44 px.
                className="min-h-12! w-full rounded-lg! px-6! text-base shadow-sm sm:ml-14 sm:w-auto sm:self-start"
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
