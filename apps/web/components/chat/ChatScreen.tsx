'use client';

// La pantalla del asistente (spec 009, HU20 y HU36): la pregunta va a POST /api/chat/stream y la
// respuesta aparece de a partes. La conversación vive mientras la pantalla está abierta (F7); su
// lógica está en useChatConversation, compartida con el panel de un paso (spec 010, F6).
import { useEffect, useRef } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import { ChatComposer } from './ChatComposer';
import { ChatEmpty } from './ChatEmpty';
import { ChatHeader } from './ChatHeader';
import { ChatMessage } from './ChatMessage';
import { CARD } from './design';
import { useChatConversation } from './useChatConversation';

export function ChatScreen() {
  const { user, status } = useSession();
  const chat = useChatConversation();
  const listRef = useRef<HTMLOListElement>(null);

  // Al llegar mensajes nuevos (y mientras se escribe la respuesta) bajamos al final de la conversación.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages]);

  if (status === 'loading') return <ScreenState kind="loading" label="Cargando…" />;
  if (!user) {
    return (
      <ScreenState
        kind="empty"
        message={
          REAL_AUTH_ENABLED ? 'Necesitás iniciar sesión para usar el asistente.' : 'Elegí un usuario de prueba'
        }
      />
    );
  }

  return (
    <section aria-label="Asistente" className={`${CARD} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
      <ChatHeader onNewConversation={chat.newConversation} />
      <ol
        ref={listRef}
        aria-label="Conversación"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 py-6"
      >
        {chat.messages.length === 0 && (
          <li>
            <ChatEmpty onPick={chat.setDraft} />
          </li>
        )}
        {chat.messages.map((message) => (
          <ChatMessage key={message.id} message={message} onRetry={chat.retry} busy={chat.busy} />
        ))}
      </ol>
      <p data-testid="chat-live" aria-live="polite" className="sr-only">
        {chat.announcement}
      </p>
      <ChatComposer
        value={chat.draft}
        busy={chat.busy}
        onChange={chat.setDraft}
        onSend={chat.send}
      />
    </section>
  );
}