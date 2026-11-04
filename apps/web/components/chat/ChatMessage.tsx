// Un mensaje del chat (spec 009, F3 a F5): la pregunta a la derecha, en bosque; la respuesta a la
// izquierda, sobre blanco. Mientras se genera, la burbuja está ocupada (aria-busy) y no se anuncia.
// Al terminar: citas y fuentes, "No encontré" o el aviso con el enlace a la búsqueda sin IA (HU36).
import Link from 'next/link';
import { linkCitations } from '@/lib/chat/citations';
import { buildSearchUrl, searchTextOf } from '@/lib/chat/search-url';
import { ChatSources } from './ChatSources';
import { BUTTON_SECONDARY, TEXT_LINK } from './design';
import type { AssistantMessage, ChatMessageItem } from './chat-state';

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
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-bosque px-4 py-3 text-blanco">
          {message.text}
        </p>
      </li>
    );
  }

  const streaming = message.status === 'streaming';
  return (
    <li className="flex justify-start">
      <div
        aria-busy={streaming || undefined}
        className="flex max-w-[85%] flex-col gap-3 rounded-2xl rounded-bl-md border border-borde bg-blanco px-4 py-3 text-texto"
      >
        <AssistantBody message={message} onRetry={onRetry} busy={busy} />
      </div>
    </li>
  );
}

function AssistantBody({ message, onRetry, busy }: { message: AssistantMessage } & Omit<ChatMessageProps, 'message'>) {
  switch (message.status) {
    case 'streaming':
      return message.text ? (
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
      ) : (
        <p className="text-texto-suave">Buscando en los documentos…</p>
      );

    case 'answered':
      return (
        <>
          <Answer message={message} />
          <ChatSources sources={message.sources} />
        </>
      );

    case 'no_info':
    case 'conflict':
      return (
        <p className="whitespace-pre-wrap rounded-xl border-2 border-dashed border-borde px-4 py-3 text-texto-suave">
          {message.text}
        </p>
      );

    case 'ai_unavailable':
      return (
        <>
          <p className="whitespace-pre-wrap">{message.text}</p>
          <SearchLink url={message.searchUrl ?? buildSearchUrl(message.question)} />
        </>
      );

    case 'cut':
    case 'error':
      return (
        <>
          <p className="font-semibold text-rosa-alerta-texto">{message.notice}</p>
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
      return <p className="font-semibold text-rosa-alerta-texto">{message.notice}</p>;
  }
}

// F4: las marcas [Sn] como citas numeradas que abren el documento de su fuente.
function Answer({ message }: { message: AssistantMessage }) {
  const segments = linkCitations(message.text, message.sources.length);
  return (
    <p className="whitespace-pre-wrap break-words">
      {segments.map((segment, index) => {
        if (segment.type === 'text') return <span key={index}>{segment.text}</span>;
        const source = message.sources[segment.number - 1];
        return (
          <Link
            key={index}
            href={`/documentos/${source.documentId}`}
            aria-label={`Fuente ${segment.number}: ${source.documentTitle}`}
            className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-salvia px-1.5 align-super text-xs font-bold text-bosque hover:bg-chip-area"
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
    <Link href={url} className={`${TEXT_LINK} self-start`}>
      {text ? `Buscar «${text}» en los documentos` : 'Buscar en los documentos'}
    </Link>
  );
}
