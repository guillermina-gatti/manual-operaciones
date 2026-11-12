'use client';

// Dónde se escribe la pregunta (spec 009, F6): hasta 2.000 caracteres, Enter envía y Shift+Enter
// agrega una línea. Mientras llega una respuesta se puede escribir, pero no enviar. El contador
// cambia de color cerca del límite, para que se note antes de cortarse.
import { useId } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { BUTTON_SECONDARY, SEND_BUTTON } from './design';

export const MESSAGE_MAX = 2000;
const NEAR_LIMIT = MESSAGE_MAX * 0.9;

interface ChatComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  // Solo el panel de un paso lo pasa: en /asistente el botón vive en la cabecera.
  onNewConversation?: () => void;
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
    <form onSubmit={submit} className="flex shrink-0 flex-col gap-2 rounded-b-2xl bg-blanco px-6 pb-4 pt-2">
      <label htmlFor={`${id}-pregunta`} className="sr-only">
        Tu pregunta
      </label>
      <div className="flex items-end gap-3">
        <textarea
          id={`${id}-pregunta`}
          rows={1}
          maxLength={MESSAGE_MAX}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={keyDown}
          aria-describedby={`${id}-contador`}
          placeholder="Escribí tu pregunta…"
          className="max-h-40 min-h-12 w-full resize-none rounded-3xl border border-borde bg-salvia/60 px-5 py-3 text-texto [field-sizing:content] placeholder:text-texto-suave focus:border-bosque"
        />
        <button type="submit" className={SEND_BUTTON} disabled={!canSend} aria-busy={busy}>
          <span className="sr-only">Preguntar</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4z" />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <p id={`${id}-contador`} className={`text-xs ${value.length >= NEAR_LIMIT ? 'font-semibold text-durazno-texto' : 'text-texto-suave'}`}>
          {value.length}/{MESSAGE_MAX}
        </p>
        {onNewConversation && (
          <button type="button" className={`${BUTTON_SECONDARY} min-h-10 px-4 text-sm`} onClick={onNewConversation}>
            Nueva conversación
          </button>
        )}
      </div>
    </form>
  );
}