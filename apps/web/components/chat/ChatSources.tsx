// Las fuentes de una respuesta (spec 009, F4): una tarjeta por fuente, que abre el detalle del
// documento. Dice "FUENTE", "Título · vN · Sección", desde cuándo está vigente esa versión (HU18)
// y el chip "Vigente": el asistente solo responde con lo vigente.
import Link from 'next/link';
import type { ChatSource } from '@/lib/api';
import { formatReviewDate } from '@/lib/documents/format';

function DocumentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

// Spec 011 (F2, PD9): con title, el texto antes de la lista y la lista con ese nombre ("Las dos
// fuentes" de una contradicción). Sin él, como siempre.
export function ChatSources({ sources, title }: { sources: ChatSource[]; title?: string }) {
  if (sources.length === 0) return null;
  const list = (
    <ul aria-label={title ?? 'Fuentes'} className="flex flex-col gap-2">
      {sources.map((source, index) => (
        <li key={source.chunkId}>
          <Link
            href={`/documentos/${source.documentId}`}
            className="flex min-h-14 max-w-full items-center gap-3 rounded-xl border border-bosque/70 bg-[#fff6d9] px-3 py-2.5 text-bosque transition-colors hover:bg-[#f2c94c]/30"
          >
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f2c94c] text-bosque">
              <DocumentIcon />
            </span>
            <span className="flex min-w-0 flex-1 flex-col break-words">
              <span aria-hidden="true" className="text-[0.7rem] font-extrabold uppercase tracking-wider text-texto-suave">
                Fuente
              </span>
              <span className="font-bold">
                <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-bosque text-xs text-blanco">
                  {index + 1}
                </span>{' '}
                {source.documentTitle} · v{source.versionNumber} · {source.section}
              </span>
              <span className="text-xs font-normal text-texto-suave">
                Vigente desde {formatReviewDate(source.validFrom)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3 text-sm">
              <span className="rounded-full bg-[#cbe6d6] px-3 py-0.5 font-semibold text-bosque">Vigente</span>
              <span className="font-bold text-naranja-boton underline underline-offset-4">Abrir</span>
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