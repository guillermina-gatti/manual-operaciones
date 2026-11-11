// Las fuentes de una respuesta (spec 009, F4): un botón por fuente, "1 Título · vN · Sección", que
// abre el detalle del documento. HU18: debajo, desde cuándo está vigente esa versión.
import Link from 'next/link';
import type { ChatSource } from '@/lib/api';
import { formatReviewDate } from '@/lib/documents/format';

// Spec 011 (F2, PD9): con title, el texto antes de la lista y la lista con ese nombre ("Las dos
// fuentes" de una contradicción). Sin él, como siempre.
export function ChatSources({ sources, title }: { sources: ChatSource[]; title?: string }) {
  if (sources.length === 0) return null;
  const list = (
    <ul aria-label={title ?? 'Fuentes'} className="flex flex-wrap gap-2">
      {sources.map((source, index) => (
        <li key={source.chunkId}>
          <Link
            href={`/documentos/${source.documentId}`}
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-borde bg-blanco px-3 py-1 text-sm font-semibold text-bosque hover:bg-salvia"
          >
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-bosque text-xs text-blanco">
              {index + 1}
            </span>{' '}
            <span className="flex min-w-0 flex-col break-words">
              <span>
                {source.documentTitle} · v{source.versionNumber} · {source.section}
              </span>
              <span className="text-xs font-normal text-texto-suave">
                Vigente desde {formatReviewDate(source.validFrom)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
  if (!title) return list;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-texto">{title}</p>
      {list}
    </div>
  );
}