'use client';

// Caja de búsqueda arriba del listado (spec 004, F1, F2, F6, F7; plan 004, 5.2 a 5.4).
// La búsqueda vive solo en la dirección (D11): buscar y borrar hacen router.push. Quien la usa la
// monta con key={q}, así al ir atrás o adelante la caja muestra el texto de la dirección.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { SEARCH_MAX, SEARCH_MIN, parseSearchParam } from '@/lib/documents/search-rules';

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
    <form role="search" onSubmit={submit} noValidate className="flex flex-col gap-1">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Buscar documentos"
          placeholder="Buscar en títulos, descripciones y contenido"
          maxLength={SEARCH_MAX}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setWarning(undefined);
          }}
          aria-invalid={warning ? true : undefined}
          aria-describedby={warning ? errorId : undefined}
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-600 sm:flex-1 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <Button type="submit">Buscar</Button>
        {hasSearch && (
          <Button variant="secondary" onClick={() => router.push('/documentos')}>
            Borrar búsqueda
          </Button>
        )}
      </div>
      {warning && (
        <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-400">
          {warning}
        </p>
      )}
    </form>
  );
}
