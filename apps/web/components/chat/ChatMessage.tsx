// Un mensaje del chat (spec 009, F3 a F5): la pregunta a la derecha, en bosque; la respuesta a la
// izquierda, sobre blanco, con la marca del asistente. Mientras se genera, la burbuja está ocupada
// (aria-busy) y se muestra un indicador de escritura, que no se anuncia. Al terminar: citas y fuentes,
// "No encontré" o el aviso con el enlace a la búsqueda sin IA (HU36).
// Spec 011: o el aviso de dos documentos que se contradicen, con las dos fuentes.
// HU25: la valoración, solo en las respuestas que se pueden valorar (answered y conflict).
// HU19: con no_info, los documentos cercanos y a quién consultar.
import Link from 'next/link';
import { linkCitations } from '@/lib/chat/citations';
import { buildSearchUrl, searchTextOf } from '@/lib/chat/search-url';
import { ChatFeedback } from './ChatFeedback';
import { ChatNearestDocuments } from './ChatNearestDocuments';
import { ChatSources } from './ChatSources';
import { ChatSuggestedContact } from './ChatSuggestedContact';
import { ConflictNotice } from './ConflictNotice';
import { AVATAR, BUTTON_SECONDARY, TEXT_LINK } from './design';
import type { AssistantMessage, ChatMessageItem } from './chat-state';

const TEXT = 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]';

interface ChatMessageProps {
  message: ChatMessageItem;
  // "Volver a preguntar" después de un corte o un error (F5).
  onRetry: (question: string) => void;
  busy: boolean;
}

export function ChatMessage({ message, onRetry, busy }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl rounded-br-md bg-bosque px-4 py-3 text-blanco">
          {message.text}
        </p>
      </li>
    );
  }

  const streaming = message.status === 'streaming';
  // Todo texto de la burbuja se corta en la burbuja, también una URL o una palabra larga.
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className={`${AVATAR} mt-1`}>
        ✦
      </span>
      <div
        aria-busy={streaming || undefined}
        className="flex min-w-0 max-w-[85%] flex-col gap-3 rounded-2xl rounded-tl-md border border-borde bg-blanco px-4 py-3 text-texto shadow-sm"
      >
        <AssistantBody message={message} onRetry={onRetry} busy={busy} />
      </div>
    </li>
  );
}

function AssistantBody({ message, onRetry, busy }: { message: AssistantMessage } & Omit<ChatMessageProps, 'message'>) {
  switch (message.status) {
    case 'streaming':
      return message.text ? <p className={TEXT}>{message.text}</p> : <Typing />;

    case 'answered':
      return (
        <>
          <Answer message={message} />
          <ChatSources sources={message.sources} />
          <Feedback message={message} />
        </>
      );

    // Spec 011 (F2): dos documentos se contradicen. El aviso, la explicación con sus citas y las dos fuentes.
    case 'conflict':
      return (
        <>
          <ConflictNotice />
          <Answer message={message} />
          <ChatSources sources={message.sources} title="Las dos fuentes" />
          <Feedback message={message} />
        </>
      );

    // HU19: sin información, los documentos cercanos y a quién consultar.
    case 'no_info':
      return (
        <>
          <p className={`${TEXT} rounded-xl border-2 border-dashed border-borde px-4 py-3 text-texto-suave`}>
            {message.text}
          </p>
          <ChatNearestDocuments documents={message.nearestDocuments} />
          <ChatSuggestedContact contact={message.suggestedContact} />
        </>
      );

    case 'ai_unavailable':
      return (
        <>
          <p className={TEXT}>{message.text}</p>
          <SearchLink url={message.searchUrl ?? buildSearchUrl(message.question)} />
        </>
      );

    case 'cut':
    case 'error':
      return (
        <>
          <p className={`${TEXT} font-semibold text-rosa-alerta-texto`}>{message.notice}</p>
          <SearchLink url={buildSearchUrl(message.question)} />
          <button
            type="button"
            className={`${BUTTON_SECONDARY} self-start`}
            disabled={busy}
            onClick={() => onRetry(message.question)}
          >
            Volver a preguntar
          </button>
        </>
      );

    case 'invalid':
      return <p className={`${TEXT} font-semibold text-rosa-alerta-texto`}>{message.notice}</p>;

    // Spec 010 (F5): el paso ya no está disponible; queda la búsqueda sin el asistente.
    case 'step-gone':
      return (
        <>
          <p className={`${TEXT} font-semibold text-rosa-alerta-texto`}>{message.notice}</p>
          <SearchLink url={buildSearchUrl(message.question)} />
        </>
      );
  }
}

// El indicador mientras llega la primera parte: tres puntos que suben y bajan (sin movimiento si el
// usuario lo pidió). El texto queda para los lectores de pantalla.
function Typing() {
  return (
    <p className="flex items-center gap-3 text-texto-suave">
      <span aria-hidden="true" className="flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 animate-bounce rounded-full bg-texto-suave motion-reduce:animate-none"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </span>
      Buscando en los documentos…
    </p>
  );
}

// HU25: sin id de mensaje no hay nada que valorar, así que no se muestra.
function Feedback({ message }: { message: AssistantMessage }) {
  return message.messageId ? <ChatFeedback messageId={message.messageId} /> : null;
}

// F4: las marcas [Sn] como citas numeradas que abren el documento de su fuente.
function Answer({ message }: { message: AssistantMessage }) {
  const segments = linkCitations(message.text, message.sources.length);
  return (
    <p className={TEXT}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') return <span key={index}>{segment.text}</span>;
        const source = message.sources[segment.number - 1];
        return (
          <Link
            key={index}
            href={`/documentos/${source.documentId}`}
            aria-label={`Fuente ${segment.number}: ${source.documentTitle}`}
            className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-salvia px-1.5 align-middle text-xs font-bold leading-5 text-bosque hover:bg-chip-area"
          >
            {segment.number}
          </Link>
        );
      })}
    </p>
  );
}

// HU36: la búsqueda sin IA, con el texto de la pregunta si alcanza para buscar.
function SearchLink({ url }: { url: string }) {
  const text = searchTextOf(url);
  return (
    <Link href={url} className={`${TEXT_LINK} max-w-full self-start break-words`}>
      {text ? `Buscar «${text}» en los documentos` : 'Buscar en los documentos'}
    </Link>
  );
}