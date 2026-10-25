// Fragmento de un resultado de búsqueda con las palabras encontradas resaltadas (spec 004, R8, R11, F4;
// plan 004, 4.3). Las partes llegan como texto plano y se dibujan como texto de React, que escapa todo:
// un <script> del documento se ve como esos caracteres. Nunca dangerouslySetInnerHTML.
import { Fragment } from 'react';
import type { SearchFragment } from '@/lib/api';

interface MatchFragmentProps {
  fragment: SearchFragment;
}

export function MatchFragment({ fragment }: MatchFragmentProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* break-words: una palabra o una dirección larga no genera desplazamiento horizontal (F7). */}
      <p className="break-words text-sm text-zinc-700 dark:text-zinc-300">
        {fragment.parts.map((part, index) =>
          part.match ? (
            <mark
              key={index}
              className="rounded-sm bg-yellow-200 px-0.5 text-zinc-950 dark:bg-yellow-400/80 dark:text-zinc-950"
            >
              {part.text}
            </mark>
          ) : (
            <Fragment key={index}>{part.text}</Fragment>
          ),
        )}
      </p>
      {fragment.pageNumber !== null && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Página {fragment.pageNumber}</p>
      )}
    </div>
  );
}
