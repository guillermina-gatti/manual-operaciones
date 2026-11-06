// The steps of the execution, in order. Each one is finished, current or pending; only the current
// one has the button to finish it. The state never depends on color alone: a check or a number in
// the circle, the state written next to a dot, and a thicker border on the current step.
import { BUTTON_PRIMARY, StatusDot } from '@/components/documents/design';
import type { DotTone } from '@/components/documents/design';
import { CheckIcon } from '@/components/metrics/icons';
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

const STATE: Record<StepState, { label: string; tone: DotTone }> = {
  finished: { label: 'Terminado', tone: 'exito' },
  current: { label: 'En curso', tone: 'azul' },
  pending: { label: 'Pendiente', tone: 'gris' },
};

const ITEM_STYLES: Record<StepState, string> = {
  finished: 'border border-borde p-5',
  current: 'border-2 border-bosque p-5 shadow-md sm:p-6',
  pending: 'border border-borde p-5',
};

// The circle: a check when finished, the number otherwise.
const CIRCLE_STYLES: Record<StepState, string> = {
  finished: 'bg-exito text-blanco',
  current: 'bg-bosque text-blanco',
  pending: 'border border-borde bg-fondo text-texto-suave',
};

export function StepList({ execution, completing, onComplete, focusCurrent }: StepListProps) {
  const last = execution.steps.at(-1);

  return (
    <ol aria-label="Pasos del procedimiento" className="flex flex-col gap-3">
      {execution.steps.map((step) => {
        const state = stateOf(step, execution.currentStepId);
        return (
          <li
            key={step.stepId}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex min-w-0 flex-col gap-4 rounded-2xl bg-blanco ${ITEM_STYLES[state]}`}
          >
            <div className="flex min-w-0 items-start gap-4">
              <span
                aria-hidden="true"
                className={`flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${CIRCLE_STYLES[state]}`}
              >
                {state === 'finished' ? <CheckIcon className="size-6" /> : step.order}
              </span>
              <div className="flex min-w-0 flex-col gap-2 pt-1">
                <h3
                  className={`break-words text-lg font-bold leading-snug ${
                    state === 'pending' ? 'text-texto-suave' : 'text-texto'
                  }`}
                >
                  <span className="sr-only">Paso {step.order}: </span>
                  {step.title}
                </h3>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-suave">
                  <StatusDot tone={STATE[state].tone}>{STATE[state].label}</StatusDot>
                  <StepTimes step={step} state={state} />
                </p>
              </div>
            </div>
            {state === 'current' && (
              <button
                type="button"
                className={`${BUTTON_PRIMARY} min-h-14 w-full text-lg sm:ml-16 sm:w-auto sm:self-start`}
                disabled={completing}
                autoFocus={focusCurrent}
                onClick={() => onComplete(step.stepId)}
              >
                {completing
                  ? 'Guardando…'
                  : step.stepId === last?.stepId
                    ? 'Terminé el último paso'
                    : 'Terminé este paso'}
              </button>
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
      <span>
        Terminó a las {formatTime(step.finishedAt)} · duró {formatDuration(step.durationMs)}
      </span>
    );
  }
  if (state === 'current' && step.startedAt) {
    return <span>Empezó a las {formatTime(step.startedAt)}</span>;
  }
  return null;
}

function stateOf(step: ExecutionStepResponse, currentStepId: string | null): StepState {
  if (step.finishedAt !== null) return 'finished';
  if (step.stepId === currentStepId) return 'current';
  return 'pending';
}
