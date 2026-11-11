'use client';

// The steps of the draft (HU09, R6 to R8): add one at the end, edit, delete, and move up or down
// (each move asks the API for the whole list in the new order). One change at a time; every answer
// of the API updates the local copy through onChange. It has no box of its own: the section that
// holds it lays its parts out.
import { LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { AddStep } from './AddStep';
import { Notice } from './Notice';
import { StepItem } from './StepItem';
import { useStepActions } from './useStepActions';

// R6: a draft admits up to 50 steps.
export const MAX_STEPS = 50;

interface StepsEditorProps {
  procedure: EditableProcedure;
  // The new copy of the procedure after the API accepted a change.
  onChange: (next: EditableProcedure) => void;
  // The procedure is not in the API anymore: leave the screen.
  onGone: () => void;
}

export function StepsEditor({ procedure, onChange, onGone }: StepsEditorProps) {
  const steps = [...procedure.steps].sort((a, b) => a.order - b.order);
  const actions = useStepActions(procedure, steps, onChange);
  const { busy, failure } = actions;

  return (
    <>
      {failure && (
        <Notice tone="error" role="alert" className="flex flex-col items-start gap-3">
          <p>{failure.message}</p>
          {failure.notFound && (
            <button type="button" className={LIST_BUTTON_SECONDARY} onClick={onGone}>
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
            <StepItem
              key={step.id}
              step={step}
              isFirst={index === 0}
              isLast={index === steps.length - 1}
              editing={actions.editingId === step.id}
              busy={busy}
              onMove={(direction) => actions.move(step, direction)}
              onStartEdit={() => actions.startEdit(step.id)}
              onCancelEdit={actions.cancelEdit}
              onSave={(values) => actions.edit(step, values)}
              onRemove={() => actions.remove(step)}
            />
          ))}
        </ol>
      )}

      {steps.length >= MAX_STEPS ? (
        <p className="text-texto-suave">El borrador ya tiene {MAX_STEPS} pasos: es el máximo.</p>
      ) : (
        <AddStep disabled={busy !== null} working={busy === 'add'} onAdd={actions.add} />
      )}
    </>
  );
}
