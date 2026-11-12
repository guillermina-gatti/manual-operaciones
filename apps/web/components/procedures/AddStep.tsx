'use client';

// "+ Agregar paso" (HU09, R6; spec 015, D24): a button with a dashed border that opens the form of a
// new step. The form clears after each step that is added and stays open to add the next one.
import { useLayoutEffect, useState } from 'react';
import type { FormValues } from '@/lib/procedures/validate';
import { ADD_BOX, ADD_BUTTON } from './design';
import { StepForm } from './StepForm';

interface AddStepProps {
  // Something is running on the screen: nothing can be sent.
  disabled: boolean;
  // That something is adding a step.
  working: boolean;
  onAdd: (values: FormValues) => Promise<boolean>;
}

export function AddStep({ disabled, working, onAdd }: AddStepProps) {
  const [open, setOpen] = useState(false);

  // Coming back to a hidden screen starts with the form closed.
  useLayoutEffect(() => () => setOpen(false), []);

  if (!open) {
    return (
      <button type="button" className={ADD_BUTTON} disabled={disabled} onClick={() => setOpen(true)}>
        + Agregar paso
      </button>
    );
  }

  return (
    <StepForm
      className={ADD_BOX}
      legend="Agregar un paso"
      submitLabel="Agregar paso"
      busyLabel="Agregando…"
      disabled={disabled}
      working={working}
      resetOnSuccess
      onSubmit={onAdd}
      onCancel={() => setOpen(false)}
    />
  );
}
