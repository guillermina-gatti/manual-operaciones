'use client';

// Caja de búsqueda arriba del listado (spec 004, F1, F2, F6, F7; plan 004, 5.2 a 5.4).
// La búsqueda vive solo en la dirección (D11): buscar y borrar hacen router.push. Quien la usa la
// monta con key={q}, así al ir atrás o adelante la caja muestra el texto de la dirección.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { SEARCH_MAX, SEARCH_MIN, parseSearchParam } from '@/lib/documents/search-rules';
import { BUTTON_SECONDARY, ERROR_TEXT, HINT, SearchIcon } from './design';
import { LIST_BUTTON_PRIMARY } from './list-design';

interface SearchBoxProps {
  // El ?q= de la dirección, tal cual (null si no hay búsqueda).
  query: string | null;
}

const TOO_SHORT = `Escribí al menos ${SEARCH_MIN} caracteres para buscar.`;
const TOO_LONG = `La búsqueda puede tener hasta ${SEARCH_MAX} caracteres.`;

// Qué aviso corresponde a un texto, o undefined si se puede buscar.
function warningFor(value: string | null): string | undefined {
  const parsed = parseSearchParam(value);
  if (parsed.kind === 'valid') return undefined;
  return parsed.kind === 'invalid' && parsed.text.length > SEARCH_MAX ? TOO_LONG : TOO_SHORT;
}

export function SearchBox({ query }: SearchBoxProps) {
  const router = useRouter();
  const errorId = useId();
  const [value, setValue] = useState(query ?? '');
  // F2: un ?q= inválido escrito a mano en la dirección se muestra con su aviso.
  const [warning, setWarning] = useState(() =>
    parseSearchParam(query).kind === 'invalid' ? warningFor(query) : undefined,
  );
  const hasSearch = parseSearchParam(query).kind !== 'none';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSearchParam(value);
    if (parsed.kind !== 'valid') {
      setWarning(warningFor(value));
      return;
    }
    // Sin ?pagina=: toda búsqueda nueva empieza en la página 1.
    router.push(`/documentos?q=${encodeURIComponent(parsed.text)}`);
  }

  return (
    <form role="search" onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-texto-suave" />
          <input
            type="search"
            aria-label="Buscar documentos"
            placeholder="Buscá por título o por contenido"
            maxLength={SEARCH_MAX}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setWarning(undefined);
            }}
            aria-invalid={warning ? true : undefined}
            aria-describedby={warning ? errorId : undefined}
            className="min-h-14 w-full min-w-0 rounded-xl border border-borde bg-blanco pr-4 pl-12 text-texto shadow-sm transition-colors placeholder:text-texto-suave hover:border-bosque/30 focus:border-bosque aria-[invalid=true]:border-peligro motion-reduce:transition-none"
          />
        </div>
        <button type="submit" className={`${LIST_BUTTON_PRIMARY} min-h-14`}>
          Buscar
        </button>
        {hasSearch && (
          <button
            type="button"
            className={`${BUTTON_SECONDARY} min-h-14`}
            onClick={() => router.push('/documentos')}
          >
            Borrar búsqueda
          </button>
        )}
      </div>
      {warning ? (
        <p id={errorId} role="alert" className={ERROR_TEXT}>
          {warning}
        </p>
      ) : (
        <p className={HINT}>Busca también adentro de los archivos. No importan las tildes.</p>
      )}
    </form>
  );
}
