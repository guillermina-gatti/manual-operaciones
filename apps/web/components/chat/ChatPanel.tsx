'use client';

// El asistente para un paso (spec 010, F1 a F5): la misma conversación que /asistente, en una
// columna angosta, con el contexto del paso en cada pedido. Sin región propia: el aside de
// ExecutionView ya se llama "Asistente" (F7).
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';
import { CARD } from './design';
import { useChatConversation } from './useChatConversation';

export interface ChatPanelStep {
  stepId: string;
  order: number;
  title: string;
}

interface ChatPanelProps {
  procedureVersionId: string;
  step: ChatPanelStep;
}

export function ChatPanel({ procedureVersionId, step }: ChatPanelProps) {
  const chat = useChatConversation({ procedureVersionId, stepId: step.stepId });

  return (
    <div className={`${CARD} flex min-w-0 flex-col`}>
      <header className="flex flex-col gap-1 rounded-t-2xl bg-celeste px-5 py-4">
        <h2 className="text-xl font-bold text-bosque">¿Dudas con este paso?</h2>
        <p className="text-sm text-texto">
          Paso {step.order} · {step.title}
        </p>
      </header>
      <ol aria-label="Conversación" className="flex min-h-40 flex-col gap-4 px-5 py-4">
        {chat.messages.length === 0 && (
          <li className="text-sm text-texto-suave">Preguntá sobre este paso y los documentos vigentes de tus áreas.</li>
        )}
        {chat.messages.map((message) => (
          <ChatMessage key={message.id} message={message} onRetry={chat.retry} busy={chat.busy} />
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">
        {chat.announcement}
      </p>
      <ChatComposer
        value={chat.draft}
        busy={chat.busy}
        onChange={chat.setDraft}
        onSend={chat.send}
        onNewConversation={chat.newConversation}
      />
    </div>
  );
}
