// Las fuentes de una respuesta (spec 009, F4): un botón por fuente, "1 Título · vN · Sección", que
// abre el detalle del documento. No se muestra validFrom hasta que Guille lo corrija (aviso 9).
import Link from 'next/link';
import type { ChatSource } from '@/lib/api';

export function ChatSources({ sources }: { sources: ChatSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label="Fuentes" className="flex flex-wrap gap-2">
      {sources.map((source, index) => (
        <li key={source.chunkId}>
          <Link
            href={`/documentos/${source.documentId}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-borde bg-blanco px-3 text-sm font-semibold text-bosque hover:bg-salvia"
          >
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-bosque text-xs text-blanco">
              {index + 1}
            </span>{' '}
            {source.documentTitle} · v{source.versionNumber} · {source.section}
          </Link>
        </li>
      ))}
    </ul>
  );
}
