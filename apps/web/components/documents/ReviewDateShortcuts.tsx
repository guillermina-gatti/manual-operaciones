'use client';

// La fecha de revisión de la carga con atajos: 3 meses, 6 meses, 1 año u Otra fecha. Envuelve a
// ReviewDateField, que no cambia (lo usan también "Subir versión nueva" y "Marcar como revisado"):
// misma etiqueta, mismo mínimo (mañana en Buenos Aires) y mismo error. Debajo, la fecha en palabras.
//
// "Ahora" se toma una vez, al montar: el formulario solo se dibuja en el navegador (pide las áreas en
// un efecto), así que no hay HTML del servidor con otra fecha.
import { useId, useRef, useState } from 'react';
import {
  REVIEW_SHORTCUTS,
  formatLongDate,
  shortcutDate,
  shortcutFor,
} from '@/lib/documents/review-shortcuts';
import { validateReviewDate } from '@/lib/documents/validate-upload';
import { ReviewDateField } from './ReviewDateField';
import { HINT } from './design';
import { SHORTCUT_OPTION } from './list-design';

interface ReviewDateShortcutsProps {
  // YYYY-MM-DD, o '' si no se eligió.
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

export function ReviewDateShortcuts({ value, error, onChange }: ReviewDateShortcutsProps) {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());
  // "Otra fecha" queda marcada al tocarla, aunque todavía no se haya escrito una fecha.
  const [chooseOther, setChooseOther] = useState(false);

  const active = shortcutFor(value, now);
  const otherPressed = active === null && (chooseOther || value !== '');
  // La fecha en palabras solo si es válida: una fecha pasada no se anuncia como la de revisión.
  const longDate = validateReviewDate(value, now) === undefined ? formatLongDate(value) : null;

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-3">
      {/* El grupo se llama "Revisar en" (sin "fecha de revisión", que es el nombre del campo). */}
      <div className="flex flex-col gap-2">
        <span id={labelId} className="font-semibold">
          Revisar en
        </span>
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {REVIEW_SHORTCUTS.map(({ months, label }) => (
            <button
              key={months}
              type="button"
              aria-pressed={active === months}
              className={SHORTCUT_OPTION}
              onClick={() => {
                setChooseOther(false);
                onChange(shortcutDate(months, now));
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={otherPressed}
            className={SHORTCUT_OPTION}
            onClick={() => {
              setChooseOther(true);
              containerRef.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
            }}
          >
            Otra fecha
          </button>
        </div>
      </div>

      <ReviewDateField value={value} error={error} onChange={onChange} />

      <p aria-live="polite" className={HINT}>
        {longDate && `Se revisa el ${longDate}.`}
      </p>
    </div>
  );
}
