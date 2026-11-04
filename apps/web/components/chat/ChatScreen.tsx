'use client';

// La pantalla del asistente (spec 009, HU20 y HU36): la pregunta va a POST /api/chat/stream y la
// respuesta aparece de a partes. La conversación vive mientras la pantalla está abierta (F7).
import { useEffect, useRef, useState } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { ChatStreamError, askStream, type ChatStreamDone } from '@/lib/api';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import { ChatComposer } from './ChatComposer';
import { ChatHeader } from './ChatHeader';
import { ChatMessage } from './ChatMessage';
import { CARD } from './design';
import { type AssistantMessage, type ChatMessageItem, withoutMarkers } from './chat-state';

const CUT_NOTICE = 'Se cortó la respuesta.';
const ERROR_NOTICE = 'El asistente no pudo responder.';
const CONVERSATION_GONE = 'Esta conversación ya no está disponible. Tu próxima pregunta empieza una nueva.';
const INVALID_NOTICE = 'No se pudo enviar la pregunta. Revisala y probá de nuevo.';

export function ChatScreen() {
  const { user, status } = useSession();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const conversationRef = useRef<string | undefined>(undefined);
  const nextId = useRef(1);
  const controllerRef = useRef<AbortController | null>(null);

  // Al salir de la pantalla se corta el pedido en curso (R11).
  useEffect(() => () => controllerRef.current?.abort(), []);

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

  function update(id: number, changes: Partial<AssistantMessage>) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.role === 'assistant' ? { ...m, ...changes } : m)),
    );
  }

  async function ask(question: string) {
    const userId = nextId.current++;
    const answerId = nextId.current++;
    setAnnouncement('');
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: question },
      { id: answerId, role: 'assistant', question, status: 'streaming', text: '', sources: [] },
    ]);
    setBusy(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    const body = conversationRef.current
      ? { message: question, conversationId: conversationRef.current }
      : { message: question };
    let text = '';

    try {
      const done = await askStream(body, {
        signal: controller.signal,
        onStart: (conversationId) => {
          conversationRef.current = conversationId;
        },
        onDelta: (part) => {
          text += part;
          update(answerId, { text });
        },
      });
      finish(answerId, done);
    } catch (error) {
      if (controller.signal.aborted) return;
      fail(answerId, error);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function finish(id: number, done: ChatStreamDone) {
    conversationRef.current = done.conversationId;
    update(id, {
      status: done.status,
      text: done.answer,
      sources: done.status === 'answered' ? done.sources : [],
      searchUrl: done.searchUrl,
    });
    setAnnouncement(withoutMarkers(done.answer));
  }

  // F5: sin done, el texto parcial se descarta y queda el aviso.
  function fail(id: number, error: unknown) {
    if (error instanceof ChatStreamError && error.kind === 'http' && error.statusCode !== 503) {
      if (error.statusCode === 404) conversationRef.current = undefined;
      const notice = error.statusCode === 404 ? CONVERSATION_GONE : INVALID_NOTICE;
      update(id, { status: 'invalid', text: '', notice });
      setAnnouncement(notice);
      return;
    }
    const cut = error instanceof ChatStreamError && error.kind === 'cut';
    const notice = cut ? CUT_NOTICE : ERROR_NOTICE;
    update(id, { status: cut ? 'cut' : 'error', text: '', notice });
    setAnnouncement(notice);
  }

  function send() {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    void ask(question);
  }

  function newConversation() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    conversationRef.current = undefined;
    setMessages([]);
    setAnnouncement('');
    setBusy(false);
  }

  return (
    <section aria-label="Asistente" className={`${CARD} flex min-w-0 flex-col`}>
      <ChatHeader />
      <ol aria-label="Conversación" className="flex min-h-64 flex-col gap-4 px-6 py-5">
        {messages.length === 0 && (
          <li className="text-texto-suave">Preguntá sobre los documentos vigentes de tus áreas.</li>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} onRetry={(question) => void ask(question)} busy={busy} />
        ))}
      </ol>
      <p data-testid="chat-live" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ChatComposer
        value={draft}
        busy={busy}
        onChange={setDraft}
        onSend={send}
        onNewConversation={newConversation}
      />
    </section>
  );
}
