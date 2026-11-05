'use client';

// The steps of the draft (HU09, R6 to R8): add one at the end, edit, delete, and move up or down
// (each move asks the API for the whole list in the new order). One change at a time; every answer
// of the API updates the local copy through onChange.
import { useLayoutEffect, useRef, useState } from 'react';
import {
  addStep,
  deleteStep,
  describeProcedureError,
  reorderSteps,
  updateStep,
} from '@/lib/procedures';
import type { ProcedureErrorContext, UpdateStepValues } from '@/lib/procedures';
import type { StoredProcedure, StoredStep } from '@/lib/procedures/session-list';
import {
  withStepAdded,
  withStepDeleted,
  withStepUpdated,
  withStepsReordered,
} from '@/lib/procedures/snapshot';
import { moveStep } from '@/lib/procedures/steps';
import type { Direction } from '@/lib/procedures/steps';
import type { FormValues } from '@/lib/procedures/validate';
import {
  ADD_BOX,
  BUTTON_ICON,
  BUTTON_ICON_DANGER,
  BUTTON_SECONDARY,
  IconDown,
  IconTrash,
  IconUp,
  Notice,
  STEP_ROW,
  StepNumber,
} from './design';
import { StepForm } from './StepForm';

// R6: a draft admits up to 50 steps.
export const MAX_STEPS = 50;

interface StepsEditorProps {
  procedure: StoredProcedure;
  // The new copy of the procedure after the API accepted a change.
  onChange: (next: StoredProcedure) => void;
  // The procedure is not in the API anymore: leave the screen.
  onGone: () => void;
}

// What is running: adding a step, saving an edited one, or the delete or the move of one step.
type Busy = 'add' | 'edit' | 'step' | null;

interface Failure {
  message: string;
  notFound: boolean;
}

export function StepsEditor({ procedure, onChange, onGone }: StepsEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Stops a second click that arrives before React renders the disabled buttons.
  const busyRef = useRef(false);
  // Changes each time the screen is hidden, so a late answer from before is ignored.
  const visitRef = useRef(0);

  // With cacheComponents, Next hides this page with <Activity> when navigating away and shows the
  // same instance on return. The cleanup runs on hide: coming back starts without old messages.
  useLayoutEffect(
    () => () => {
      visitRef.current += 1;
      busyRef.current = false;
      setBusy(null);
      setFailure(null);
      setEditingId(null);
    },
    [],
  );

  const steps = [...procedure.steps].sort((a, b) => a.order - b.order);

  // Runs one change: the API call gives the new copy. Says whether it was done.
  async function run(
    kind: Exclude<Busy, null>,
    context: ProcedureErrorContext,
    action: () => Promise<StoredProcedure>,
  ): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    const visit = visitRef.current;
    setBusy(kind);
    setFailure(null);
    try {
      const next = await action();
      // The API accepted it: the copy is updated even if the user already left.
      onChange(next);
      return visitRef.current === visit;
    } catch (error) {
      if (visitRef.current === visit) setFailure(describeProcedureError(error, context));
      return false;
    } finally {
      // After leaving, the hide cleanup already reset these, and a new action may be running.
      if (visitRef.current === visit) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  const add = (values: FormValues) =>
    run('add', 'step', async () =>
      withStepAdded(
        procedure,
        await addStep(procedure.id, procedure.versionId, {
          title: values.title,
          ...(values.description !== '' && { description: values.description }),
        }),
      ),
    );

  async function edit(step: StoredStep, values: FormValues): Promise<boolean> {
    const changes: UpdateStepValues = {};
    if (values.title !== step.title) changes.title = values.title;
    if (values.description !== step.description) changes.description = values.description;
    if (Object.keys(changes).length === 0) {
      setEditingId(null);
      return true;
    }
    const done = await run('edit', 'step', async () =>
      withStepUpdated(
        procedure,
        await updateStep(procedure.id, procedure.versionId, step.id, changes),
      ),
    );
    if (done) setEditingId(null);
    return done;
  }

  const remove = (step: StoredStep) =>
    run('step', 'step', async () => {
      await deleteStep(procedure.id, procedure.versionId, step.id);
      return withStepDeleted(procedure, step.id);
    });

  function move(step: StoredStep, direction: Direction) {
    const stepIds = moveStep(steps, step.id, direction);
    if (!stepIds) return;
    void run('step', 'reorder', async () =>
      withStepsReordered(
        procedure,
        await reorderSteps(procedure.id, procedure.versionId, stepIds),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {failure && (
        <Notice tone="error" role="alert" className="flex flex-col items-start gap-3">
          <p>{failure.message}</p>
          {failure.notFound && (
            <button type="button" className={BUTTON_SECONDARY} onClick={onGone}>
              Quitar de la lista
            </button>
          )}
        </Notice>
      )}

      {steps.length === 0 ? (
        <p className="text-texto-suave">Todavía no tiene pasos.</p>
      ) : (
        <ol aria-label="Pasos" className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <li key={step.id} className={STEP_ROW}>
              {editingId === step.id ? (
                <StepForm
                  legend="Editar el paso"
                  initial={{ title: step.title, description: step.description }}
                  submitLabel="Guardar paso"
                  busyLabel="Guardando…"
                  disabled={busy !== null}
                  working={busy === 'edit'}
                  onSubmit={(values) => edit(step, values)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex min-w-0 items-start gap-4">
                    <StepNumber>{step.order}</StepNumber>
                    <div className="flex min-w-0 flex-col gap-1 pt-1.5">
                      <h3 className="break-words text-lg font-semibold leading-snug text-texto">
                        <span className="sr-only">Paso {step.order}: </span>
                        {step.title}
                      </h3>
                      {step.description && (
                        <p className="whitespace-pre-line break-words text-texto-suave">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:ml-14">
                    <button
                      type="button"
                      className={BUTTON_ICON}
                      aria-label={`Subir paso: ${step.title}`}
                      disabled={busy !== null || index === 0}
                      onClick={() => move(step, 'up')}
                    >
                      <IconUp />
                    </button>
                    <button
                      type="button"
                      className={BUTTON_ICON}
                      aria-label={`Bajar paso: ${step.title}`}
                      disabled={busy !== null || index === steps.length - 1}
                      onClick={() => move(step, 'down')}
                    >
                      <IconDown />
                    </button>
                    <button
                      type="button"
                      className={BUTTON_SECONDARY}
                      aria-label={`Editar paso: ${step.title}`}
                      disabled={busy !== null}
                      onClick={() => {
                        setFailure(null);
                        setEditingId(step.id);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={BUTTON_ICON_DANGER}
                      aria-label={`Borrar paso: ${step.title}`}
                      disabled={busy !== null}
                      onClick={() => void remove(step)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {steps.length >= MAX_STEPS ? (
        <p className="text-texto-suave">
          El borrador ya tiene {MAX_STEPS} pasos: es el máximo.
        </p>
      ) : (
        <div className={ADD_BOX}>
        <StepForm
            legend="Agregar un paso"
            submitLabel="Agregar paso"
            busyLabel="Agregando…"
            disabled={busy !== null}
            working={busy === 'add'}
            resetOnSuccess
            onSubmit={add}
          />
      </div>
      )}
    </div>
  );
}
