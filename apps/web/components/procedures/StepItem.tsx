'use client';

// One step of the draft (HU09, R6 to R8; spec 015, D24 and D25): a sage row with its number, title and
// description, and its buttons. The trash asks first, in a dialog. While it is being edited, the form
// takes its place.
import { useLayoutEffect, useState } from 'react';
import type { EditableStep } from '@/lib/procedures/editable';
import type { Direction } from '@/lib/procedures/steps';
import type { FormValues } from '@/lib/procedures/validate';
import { ConfirmDialog } from './ConfirmDialog';
import { STEP_ROW, StepNumber } from './design';
import { StepActions } from './StepActions';
import { StepForm } from './StepForm';
import type { Busy } from './useStepActions';

interface StepItemProps {
  step: EditableStep;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  busy: Busy;
  onMove: (direction: Direction) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: FormValues) => Promise<boolean>;
  // Says whether the step was deleted.
  onRemove: () => Promise<boolean>;
}

export function StepItem({
  step,
  isFirst,
  isLast,
  editing,
  busy,
  onMove,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
}: StepItemProps) {
  const [asking, setAsking] = useState(false);

  // Coming back to a hidden screen starts without the dialog open.
  useLayoutEffect(() => () => setAsking(false), []);

  async function confirm() {
    await onRemove();
    setAsking(false);
  }

  if (editing) {
    return (
      <li className={STEP_ROW}>
        <StepForm
          legend="Editar el paso"
          initial={{ title: step.title, description: step.description }}
          submitLabel="Guardar paso"
          busyLabel="Guardando…"
          disabled={busy !== null}
          working={busy === 'edit'}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      </li>
    );
  }

  return (
    <li className={`${STEP_ROW} flex flex-wrap items-center gap-x-4 gap-y-3`}>
      <StepNumber>{step.order}</StepNumber>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <h3 className="break-words text-lg font-semibold leading-snug text-texto">
          <span className="sr-only">Paso {step.order}: </span>
          {step.title}
        </h3>
        {step.description && (
          <p className="whitespace-pre-line break-words text-texto-suave">{step.description}</p>
        )}
      </div>
      <StepActions
        step={step}
        isFirst={isFirst}
        isLast={isLast}
        busy={busy}
        onMove={onMove}
        onStartEdit={onStartEdit}
        onAskRemove={() => setAsking(true)}
      />
      {asking && (
        <ConfirmDialog
          title={`¿Borrar el paso «${step.title}»?`}
          busy={busy === 'step'}
          onConfirm={confirm}
          onCancel={() => setAsking(false)}
        >
          Se quita del borrador y los demás pasos se vuelven a numerar. No se puede deshacer.
        </ConfirmDialog>
      )}
    </li>
  );
}
