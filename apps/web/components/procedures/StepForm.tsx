'use client';

// The form of a step (HU09, R6), to add one or to edit one: a title and an optional description.
// It checks the data and gives them, trimmed, to onSubmit; the screen that owns the form talks to the API.
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { validateStep } from '@/lib/procedures/validate';
import type { FormErrors, FormValues } from '@/lib/procedures/validate';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT, LABEL } from './design';

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
}: StepFormProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
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
    <form
      aria-label={legend}
      onSubmit={submit}
      noValidate
      className="flex min-w-0 flex-col gap-4"
    >
      <p className="text-lg font-bold">{legend}</p>

      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className={LABEL}>
          Título del paso
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          className={INPUT}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${titleId}-error` : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
        />
        <FieldError id={`${titleId}-error`} message={errors.title} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={descriptionId} className={LABEL}>
          Descripción del paso (opcional)
        </label>
        <textarea
          id={descriptionId}
          rows={2}
          value={description}
          className={INPUT}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          onChange={(event) => {
            setDescription(event.target.value);
            if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
          }}
        />
        <FieldError id={`${descriptionId}-error`} message={errors.description} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BUTTON_PRIMARY} disabled={disabled} aria-busy={working}>
          {resetOnSuccess && !working && <span aria-hidden="true">+</span>}
          {working ? busyLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={BUTTON_SECONDARY} onClick={onCancel} disabled={disabled}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
