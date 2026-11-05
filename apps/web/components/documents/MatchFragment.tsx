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
    <div className="flex flex-col gap-1 border-t border-borde pt-4">
      {/* break-words: una palabra o una dirección larga no genera desplazamiento horizontal (F7). */}
      <p className="break-words text-sm text-texto">
        {fragment.parts.map((part, index) =>
          part.match ? (
            // Durazno y no celeste: el celeste es solo del asistente.
            <mark key={index} className="rounded-sm bg-durazno px-0.5 font-semibold text-texto">
              {part.text}
            </mark>
          ) : (
            <Fragment key={index}>{part.text}</Fragment>
          ),
        )}
      </p>
      {fragment.pageNumber !== null && (
        <p className="text-xs text-texto-suave">Página {fragment.pageNumber}</p>
      )}
    </div>
  );
}
