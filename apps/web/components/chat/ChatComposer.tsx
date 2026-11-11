'use client';

// Dónde se escribe la pregunta (spec 009, F6): hasta 2.000 caracteres, Enter envía y Shift+Enter
// agrega una línea. Mientras llega una respuesta se puede escribir, pero no enviar. El contador
// cambia de color cerca del límite, para que se note antes de cortarse.
import { useId } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { BUTTON_AI, BUTTON_SECONDARY } from './design';

export const MESSAGE_MAX = 2000;
const NEAR_LIMIT = MESSAGE_MAX * 0.9;

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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-b-2xl border-t border-borde bg-salvia/50 px-6 py-4">
      <label htmlFor={`${id}-pregunta`} className="font-semibold text-bosque">
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
        placeholder="Escribí tu pregunta…"
        className="w-full resize-y rounded-xl border border-borde bg-blanco px-4 py-3 text-texto placeholder:text-texto-suave"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={`${id}-contador`} className={`text-sm ${value.length >= NEAR_LIMIT ? 'font-semibold text-durazno-texto' : 'text-texto-suave'}`}>
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