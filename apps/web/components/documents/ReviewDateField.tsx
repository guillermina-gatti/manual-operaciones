'use client';

// Fecha de revisión (F2 del plan 002; R7b de la spec 003). La usan la carga, donde es obligatoria, y
// la versión nueva, donde es opcional y muestra la fecha actual como ayuda (plan 003, 6.3).
import { useId, useState } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { COMPANY_TIME_ZONE, formatReviewDate } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';

interface ReviewDateFieldProps {
  // YYYY-MM-DD, o '' si no se eligió.
  value: string;
  onChange: (value: string) => void;
  error?: string;
  optional?: boolean;
  // La fecha que ya tiene el documento (YYYY-MM-DD), para la ayuda del modo opcional.
  currentDate?: string;
  // Otra etiqueta, por ejemplo la de "Marcar como revisado" (spec 005). Sin ella, las de siempre.
  label?: string;
}

const INPUT =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 aria-[invalid=true]:border-red-600 sm:max-w-xs dark:border-zinc-600 dark:bg-zinc-900';

export function ReviewDateField({
  value,
  onChange,
  error,
  optional = false,
  currentDate,
  label,
}: ReviewDateFieldProps) {
  const id = useId();
  // Mínimo del <input type="date">: mañana en Buenos Aires (D1 del plan 001).
  const [min] = useState(() => tomorrowIn(COMPANY_TIME_ZONE, new Date()));
  const hint = optional && currentDate ? `Fecha actual: ${formatReviewDate(currentDate)}` : null;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-input`} className="font-medium">
        {label ?? (optional ? 'Nueva fecha de revisión (opcional)' : 'Fecha de revisión')}
      </label>
      <input
        id={`${id}-input`}
        type="date"
        min={min}
        className={INPUT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-zinc-600 dark:text-zinc-400">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
