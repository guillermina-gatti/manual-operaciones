'use client';

// The buttons of a step of the draft (HU09, R7 and R8; spec 015, D24): up, down, edit and the red
// trash. The trash only asks: the confirmation and the delete belong to whoever uses this.
import { LIST_BUTTON_DANGER, LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import type { EditableStep } from '@/lib/procedures/editable';
import type { Direction } from '@/lib/procedures/steps';
import { IconDown, IconTrash, IconUp } from './design';
import type { Busy } from './useStepActions';

// A button with only an icon: square, 48 px. It always has an aria-label. The button classes bring
// px-5, so px-0 has to be important or the padding squeezes the icon.
const ICON_ONLY = 'size-12 px-0!';

interface StepActionsProps {
  step: EditableStep;
  isFirst: boolean;
  isLast: boolean;
  busy: Busy;
  onMove: (direction: Direction) => void;
  onStartEdit: () => void;
  onAskRemove: () => void;
}

export function StepActions({ step, isFirst, isLast, busy, onMove, onStartEdit, onAskRemove }: StepActionsProps) {
  return (
    <footer className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${LIST_BUTTON_SECONDARY} ${ICON_ONLY}`}
        aria-label={`Subir paso: ${step.title}`}
        disabled={busy !== null || isFirst}
        onClick={() => onMove('up')}
      >
        <IconUp />
      </button>
      <button
        type="button"
        className={`${LIST_BUTTON_SECONDARY} ${ICON_ONLY}`}
        aria-label={`Bajar paso: ${step.title}`}
        disabled={busy !== null || isLast}
        onClick={() => onMove('down')}
      >
        <IconDown />
      </button>
      <button
        type="button"
        className={LIST_BUTTON_SECONDARY}
        aria-label={`Editar paso: ${step.title}`}
        disabled={busy !== null}
        onClick={onStartEdit}
      >
        Editar
      </button>
      <button
        type="button"
        className={`${LIST_BUTTON_DANGER} ${ICON_ONLY}`}
        aria-label={`Borrar el paso ${step.title}`}
        disabled={busy !== null}
        onClick={onAskRemove}
      >
        <IconTrash />
      </button>
    </footer>
  );
}
