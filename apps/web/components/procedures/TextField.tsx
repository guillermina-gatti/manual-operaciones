'use client';

// A text field with its label and its error (HU09). One line, or a textarea if it has rows. The error
// is tied to the field with aria-describedby, and the field is marked with aria-invalid.
import { useId } from 'react';
import type { ChangeEvent } from 'react';
import { INPUT, LABEL } from '@/components/documents/design';
import { FieldError } from '@/components/ui/FieldError';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  error?: string;
  // With rows it is a textarea.
  rows?: number;
}

export function TextField({ label, value, onChange, error, rows }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const shared = {
    id,
    value,
    onChange,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={`${LABEL} text-base`}>
        {label}
      </label>
      {rows ? (
        <textarea rows={rows} className={`${INPUT} py-3 text-base`} {...shared} />
      ) : (
        <input type="text" className={`${INPUT} text-base`} {...shared} />
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
