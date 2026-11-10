'use client';

// The mark "Es un cambio crítico" of a publication and, when it is marked, the field for its summary
// (spec 015, R5). Controlled: the screen that publishes keeps the values and checks them.
import { useId } from 'react';
import { TextField } from './TextField';

interface CriticalChangeProps {
  critical: boolean;
  onCriticalChange: (critical: boolean) => void;
  summary: string;
  onSummaryChange: (summary: string) => void;
  // The message of the summary field, if it is not valid.
  summaryError?: string;
}

export function CriticalChange({
  critical,
  onCriticalChange,
  summary,
  onSummaryChange,
  summaryError,
}: CriticalChangeProps) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="flex min-h-11 basis-full cursor-pointer items-center gap-3 font-semibold">
        <input
          id={id}
          type="checkbox"
          className="size-5 accent-bosque"
          checked={critical}
          onChange={(event) => onCriticalChange(event.target.checked)}
        />
        Es un cambio crítico
      </label>
      {critical && (
        <TextField
          className="basis-full"
          label="Resumen del cambio"
          rows={2}
          value={summary}
          error={summaryError}
          onChange={(event) => onSummaryChange(event.target.value)}
        />
      )}
    </>
  );
}
