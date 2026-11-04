'use client';

// Dónde se escribe la pregunta (spec 009, F6): hasta 2.000 caracteres, Enter envía y Shift+Enter
// agrega una línea. Mientras llega una respuesta se puede escribir, pero no enviar.
import { useId } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { BUTTON_AI, BUTTON_SECONDARY } from './design';

export const MESSAGE_MAX = 2000;

interface ChatComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
}

export function ChatComposer({ value, busy, onChange, onSend, onNewConversation }: ChatComposerProps) {
  const id = useId();
  const canSend = !busy && value.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSend();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-borde px-6 py-4">
      <label htmlFor={`${id}-pregunta`} className="font-semibold">
        Tu pregunta
      </label>
      <textarea
        id={`${id}-pregunta`}
        rows={3}
        maxLength={MESSAGE_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keyDown}
        aria-describedby={`${id}-contador`}
        className="w-full resize-y rounded-xl border border-borde bg-blanco px-4 py-3 text-texto"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={`${id}-contador`} className="text-sm text-texto-suave">
          {value.length}/{MESSAGE_MAX}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={BUTTON_SECONDARY} onClick={onNewConversation}>
            Nueva conversación
          </button>
          <button type="submit" className={BUTTON_AI} disabled={!canSend} aria-busy={busy}>
            Preguntar <span aria-hidden="true">✦</span>
          </button>
        </div>
      </div>
    </form>
  );
}
