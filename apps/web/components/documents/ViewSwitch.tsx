'use client';

// Selector de vista del listado: Lista o Tarjetas (botones con aria-pressed). La vista vive en la
// dirección (?vista=tarjetas); cambiarla reemplaza la entrada del historial y conserva la búsqueda y
// la página.
import { useRouter, useSearchParams } from 'next/navigation';
import type { JSX } from 'react';
import { hrefForView } from '@/lib/documents/view';
import type { DocumentsView } from '@/lib/documents/view';
import { VIEW_OPTION, VIEW_SWITCH } from './list-design';

const PATH = '/documentos';

function ListIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle cx="3.5" cy="5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="15" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

const OPTIONS: { view: DocumentsView; label: string; Icon: () => JSX.Element }[] = [
  { view: 'lista', label: 'Lista', Icon: ListIcon },
  { view: 'tarjetas', label: 'Tarjetas', Icon: GridIcon },
];

export function ViewSwitch({ view }: { view: DocumentsView }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div role="group" aria-label="Vista" className={VIEW_SWITCH}>
      {OPTIONS.map(({ view: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          className={VIEW_OPTION}
          onClick={() => {
            if (option === view) return;
            router.replace(hrefForView(PATH, new URLSearchParams(searchParams), option), {
              scroll: false,
            });
          }}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}
