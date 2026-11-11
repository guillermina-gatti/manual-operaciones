'use client';

// La conversación con el asistente (spec 009; spec 010, F6): la comparten /asistente (ChatScreen) y
// el panel de un paso (ChatPanel). Movida de ChatScreen sin cambiarla; suma el contexto del paso.
import { useEffect, useRef, useState } from 'react';
import { ChatStreamError, askStream, type ChatStreamDone } from '@/lib/api';
import { type AssistantMessage, type ChatMessageItem, withoutMarkers } from './chat-state';
import { CONFLICT_TITLE } from './ConflictNotice';

const CUT_NOTICE = 'Se cortó la respuesta.';
const ERROR_NOTICE = 'El asistente no pudo responder.';
const CONVERSATION_GONE = 'Esta conversación ya no está disponible. Tu próxima pregunta empieza una nueva.';
const INVALID_NOTICE = 'No se pudo enviar la pregunta. Revisala y probá de nuevo.';
// Spec 010 (F5): el 404 del paso ("El paso no está disponible").
export const STEP_GONE_NOTICE =
  'Este paso ya no está disponible para consultas. Podés buscar en los documentos sin el asistente.';
const STEP_NOT_AVAILABLE = 'El paso no está disponible';

// Spec 010: el paso desde el que se pregunta.
export interface ChatContext {
  procedureVersionId: string;
  stepId: string;
}

export function useChatConversation(context?: ChatContext) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const conversationRef = useRef<string | undefined>(undefined);
  const nextId = useRef(1);
  const controllerRef = useRef<AbortController | null>(null);

  // Al salir de la pantalla se corta el pedido en curso (R11 de la spec 009).
  useEffect(() => () => controllerRef.current?.abort(), []);

  // Spec 010 (F4): una conversación por paso; si cambia el paso, se empieza otra.
  const stepId = context?.stepId;
  const previousStep = useRef(stepId);
  useEffect(() => {
    if (previousStep.current === stepId) return;
    previousStep.current = stepId;
    newConversation();
  }, [stepId]);

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
    const body = {
      message: question,
      ...(conversationRef.current && { conversationId: conversationRef.current }),
      ...(context && { context: { procedureVersionId: context.procedureVersionId, stepId: context.stepId } }),
    };
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
      // Spec 011 (F1): con conflict, las dos fuentes de la contradicción.
      sources: done.status === 'answered' || done.status === 'conflict' ? done.sources : [],
      searchUrl: done.searchUrl,
      // HU25: el mensaje que se va a valorar.
      messageId: done.messageId,
      // HU19: con no_info, los documentos cercanos.
      nearestDocuments: done.nearestDocuments,
      suggestedContact: done.suggestedContact,
    });
    // Spec 011 (F3): con conflict, el título del aviso antes de la explicación.
    const answer = withoutMarkers(done.answer);
    setAnnouncement(done.status === 'conflict' ? `${CONFLICT_TITLE}. ${answer}` : answer);
  }

  // F5: sin done, el texto parcial se descarta y queda el aviso.
  function fail(id: number, error: unknown) {
    if (error instanceof ChatStreamError && error.kind === 'http' && error.statusCode !== 503) {
      // Spec 010 (F5): el paso ya no está disponible, con el enlace a la búsqueda.
      if (error.statusCode === 404 && error.apiError?.messages.includes(STEP_NOT_AVAILABLE)) {
        update(id, { status: 'step-gone', text: '', notice: STEP_GONE_NOTICE });
        setAnnouncement(STEP_GONE_NOTICE);
        return;
      }
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

  return {
    messages,
    draft,
    setDraft,
    busy,
    announcement,
    send,
    retry: (question: string) => void ask(question),
    newConversation,
  };
}