'use client';

// The form of a step (HU09, R6), to add one or to edit one: a title and an optional description.
// It checks the data and gives them, trimmed, to onSubmit; the screen that owns the form talks to the API.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import { validateStep } from '@/lib/procedures/validate';
import type { FormErrors, FormValues } from '@/lib/procedures/validate';
import { TextField } from './TextField';

interface StepFormProps {
  // The name of the form, also for screen readers.
  legend: string;
  initial?: FormValues;
  submitLabel: string;
  // The text of the button while its own action is running.
  busyLabel: string;
  // Something is running on the screen: nothing can be sent.
  disabled: boolean;
  // That something is the action of this form.
  working: boolean;
  // true when it was done; the form is then cleared if resetOnSuccess.
  onSubmit: (values: FormValues) => Promise<boolean>;
  resetOnSuccess?: boolean;
  onCancel?: () => void;
  className?: string;
}

export function StepForm({
  legend,
  initial = { title: '', description: '' },
  submitLabel,
  busyLabel,
  disabled,
  working,
  onSubmit,
  resetOnSuccess = false,
  onCancel,
  className,
}: StepFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [errors, setErrors] = useState<FormErrors>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;

    const found = validateStep({ title, description });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const done = await onSubmit({ title: title.trim(), description: description.trim() });
    if (done && resetOnSuccess) {
      setTitle('');
      setDescription('');
    }
  }

  return (
    <form aria-label={legend} onSubmit={submit} noValidate className={className}>
      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className="mb-4 text-lg font-bold">{legend}</legend>
        <TextField
          label="Título del paso"
          value={title}
          error={errors.title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
        />
        <TextField
          label="Descripción del paso (opcional)"
          rows={2}
          value={description}
          error={errors.description}
          onChange={(event) => {
            setDescription(event.target.value);
            if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
          }}
        />
        <footer className="flex flex-wrap gap-3">
          <button type="submit" className={LIST_BUTTON_PRIMARY} disabled={disabled} aria-busy={working}>
            {resetOnSuccess && !working && <span aria-hidden="true">+</span>}
            {working ? busyLabel : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              className={LIST_BUTTON_SECONDARY}
              onClick={onCancel}
              disabled={disabled}
            >
              Cancelar
            </button>
          )}
        </footer>
      </fieldset>
    </form>
  );
}
