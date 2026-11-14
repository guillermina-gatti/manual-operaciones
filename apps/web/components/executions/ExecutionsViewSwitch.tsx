'use client';

// The view switch of /ejecuciones and of "Para retomar": Lista or Tarjetas, two buttons with
// aria-pressed, as the one of /documentos (same classes, icons and texts). That one has its path
// and its default (Lista) fixed, so this is its twin for executions: the view lives in the address
// (?vista=lista), changing it replaces the history entry and keeps the other parameters.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { JSX } from 'react';
import { VIEW_OPTION, VIEW_SWITCH } from '@/components/documents/list-design';
import { hrefForExecutionsView } from '@/lib/executions/view';
import type { ExecutionsView } from '@/lib/executions/view';

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="size-4"
    >
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle cx="3.5" cy="5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="15" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-4"
    >
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

// The same order and texts as /documentos; "Ver como" only for screen readers.
const OPTIONS: { view: ExecutionsView; label: string; Icon: () => JSX.Element }[] = [
  { view: 'lista', label: 'Lista', Icon: ListIcon },
  { view: 'tarjetas', label: 'Tarjetas', Icon: GridIcon },
];

export function ExecutionsViewSwitch({ view }: { view: ExecutionsView }) {
  const router = useRouter();
  const pathname = usePathname();
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
            router.replace(
              hrefForExecutionsView(pathname, new URLSearchParams(searchParams), option),
              { scroll: false },
            );
          }}
        >
          <Icon />
          <span className="sr-only">Ver como</span> {label}
        </button>
      ))}
    </div>
  );
}
