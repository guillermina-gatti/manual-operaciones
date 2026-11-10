// What the steps editor does with the API (HU09, R6 to R8): add, edit, delete and move a step. One
// change at a time; every answer of the API gives the new copy of the procedure to onChange.
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

// What is running: adding a step, saving an edited one, or the delete or the move of one step.
export type Busy = 'add' | 'edit' | 'step' | null;

export interface Failure {
  message: string;
  notFound: boolean;
}

export function useStepActions(
  procedure: StoredProcedure,
  // The steps in order, as the screen shows them.
  steps: StoredStep[],
  onChange: (next: StoredProcedure) => void,
) {
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
      withStepsReordered(procedure, await reorderSteps(procedure.id, procedure.versionId, stepIds)),
    );
  }

  function startEdit(stepId: string) {
    setFailure(null);
    setEditingId(stepId);
  }

  return {
    busy,
    failure,
    editingId,
    add,
    edit,
    remove,
    move,
    startEdit,
    cancelEdit: () => setEditingId(null),
  };
}
