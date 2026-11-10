'use client';

// One step of the draft (HU09, R6 to R8): its number, title and description, and the buttons to
// move, edit and delete it. While it is being edited, the form takes its place.
import type { StoredStep } from '@/lib/procedures/session-list';
import type { Direction } from '@/lib/procedures/steps';
import type { FormValues } from '@/lib/procedures/validate';
import {
  BUTTON_ICON,
  BUTTON_ICON_DANGER,
  BUTTON_SECONDARY,
  IconDown,
  IconTrash,
  IconUp,
  STEP_ROW,
  StepNumber,
} from './design';
import { StepForm } from './StepForm';
import type { Busy } from './useStepActions';

interface StepItemProps {
  step: StoredStep;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  busy: Busy;
  onMove: (direction: Direction) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: FormValues) => Promise<boolean>;
  onRemove: () => void;
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

  // The number on the left, over the title and the description; the buttons below them.
  return (
    <li className={`${STEP_ROW} grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2`}>
      <StepNumber>{step.order}</StepNumber>
      <h3 className="col-start-2 break-words pt-1.5 text-lg font-semibold leading-snug text-texto">
        <span className="sr-only">Paso {step.order}: </span>
        {step.title}
      </h3>
      {step.description && (
        <p className="col-start-2 whitespace-pre-line break-words text-texto-suave">
          {step.description}
        </p>
      )}
      <footer className="col-span-2 mt-2 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-2">
        <button
          type="button"
          className={BUTTON_ICON}
          aria-label={`Subir paso: ${step.title}`}
          disabled={busy !== null || isFirst}
          onClick={() => onMove('up')}
        >
          <IconUp />
        </button>
        <button
          type="button"
          className={BUTTON_ICON}
          aria-label={`Bajar paso: ${step.title}`}
          disabled={busy !== null || isLast}
          onClick={() => onMove('down')}
        >
          <IconDown />
        </button>
        <button
          type="button"
          className={BUTTON_SECONDARY}
          aria-label={`Editar paso: ${step.title}`}
          disabled={busy !== null}
          onClick={onStartEdit}
        >
          Editar
        </button>
        <button
          type="button"
          className={BUTTON_ICON_DANGER}
          aria-label={`Borrar paso: ${step.title}`}
          disabled={busy !== null}
          onClick={onRemove}
        >
          <IconTrash />
        </button>
      </footer>
    </li>
  );
}
