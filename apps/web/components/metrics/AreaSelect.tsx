'use client';

// Area selector of the metrics filters: a button that opens a list with a search box. With 20 or
// more areas, a plain list or chips do not fit. Keyboard: the arrows move through the list, Enter
// chooses, Escape closes and clears the search. The chosen option has a check and bold text, not
// only a background. Whoever uses it decides what choosing does (the filters apply it at once).
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { INPUT, LABEL, SearchIcon } from '@/components/documents/design';
import { matchesAreaSearch } from '@/lib/metrics/filters';
import type { AreaOption } from '@/lib/metrics/filters';
import { BuildingIcon, CheckIcon, ChevronDownIcon } from './icons';

interface AreaSelectProps {
  options: AreaOption[]; // the first one is "Todas las áreas" / "Todas mis áreas"
  value: string; // '' means every area
  onChange: (value: string) => void;
}

const AREA_SELECT_MESSAGES = {
  search: 'Buscar área…',
  noMatches: 'No hay áreas con ese nombre.',
} as const;

export function AreaSelect({ options, value, onChange }: AreaSelectProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value) ?? options[0];
  const visible = options.filter((option) => matchesAreaSearch(option.label, search));
  const activeOption = visible[Math.min(active, visible.length - 1)];

  function close({ focusButton }: { focusButton: boolean }) {
    setOpen(false);
    setSearch('');
    if (focusButton) buttonRef.current?.focus();
  }

  function toggle() {
    if (open) return close({ focusButton: false });
    setActive(Math.max(visible.findIndex((option) => option.value === value), 0));
    setOpen(true);
  }

  function choose(option: AreaOption) {
    onChange(option.value);
    close({ focusButton: true });
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ focusButton: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => Math.min(Math.max(current + step, 0), visible.length - 1));
    } else if (event.key === 'Enter') {
      // Never submits the form from the search box.
      event.preventDefault();
      if (activeOption) choose(activeOption);
    }
  }

  // Opening the list is asking to choose: the search box takes the focus. A click anywhere
  // else closes the list.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setSearch('');
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const optionId = (option: AreaOption) => `${id}-option-${option.value || 'all'}`;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <span id={labelId} className={LABEL}>
        Área
      </span>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${buttonId}`}
        onClick={toggle}
        className={`${INPUT} flex items-center gap-3 text-left`}
      >
        <BuildingIcon className="text-texto-suave" />
        <span className="min-w-0 flex-1 truncate font-semibold">{selected?.label}</span>
        {selected?.value === '' && selected.hint && (
          <span className="shrink-0 text-sm text-texto-suave">{selected.hint}</span>
        )}
        <ChevronDownIcon
          className={`text-texto-suave transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-2 flex min-w-72 flex-col gap-2 rounded-xl border border-borde bg-blanco p-2 shadow-lg transition-[opacity,translate] duration-150 motion-reduce:transition-none starting:-translate-y-1 starting:opacity-0">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-suave" />
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-label="Buscar área"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
              placeholder={AREA_SELECT_MESSAGES.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              className={`${INPUT} pl-11`}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className="max-h-[300px] overflow-y-auto"
          >
            {visible.map((option) => {
              const isSelected = option.value === selected?.value;
              const isActive = option === activeOption;
              return (
                <li
                  key={option.value}
                  id={optionId(option)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(option)}
                  onPointerMove={() => setActive(visible.indexOf(option))}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 ${
                    isSelected ? 'bg-salvia font-bold' : ''
                  } ${isActive ? 'outline-2 -outline-offset-2 outline-naranja' : ''}`}
                >
                  <CheckIcon
                    className={`size-4 text-bosque ${isSelected ? '' : 'invisible'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 text-sm font-normal text-texto-suave">
                      {option.hint}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && (
            <p role="status" className="px-3 py-2 text-texto-suave">
              {AREA_SELECT_MESSAGES.noMatches}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
