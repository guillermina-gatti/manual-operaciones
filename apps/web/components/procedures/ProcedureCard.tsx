'use client';

// One procedure of the list (HU09): the whole card goes to its editor through the link of the title,
// and "Quitar de la lista" stays usable above it. Areas are only counted: their names come with HU11.
import Link from 'next/link';
import { CHIP } from '@/components/documents/design';
import {
  LIST_BUTTON_SMALL,
  LIST_CARD,
  LIST_CARD_LAYER,
  TILE_LINK,
} from '@/components/documents/list-design';
import type { StoredProcedure } from '@/lib/procedures/session-list';

function summary(procedure: StoredProcedure): string {
  const steps = procedure.steps.length;
  const areas = procedure.areaIds.length;
  return [
    steps === 0 ? 'sin pasos' : `${steps} ${steps === 1 ? 'paso' : 'pasos'}`,
    areas === 0 ? 'sin áreas' : `${areas} ${areas === 1 ? 'área' : 'áreas'}`,
  ].join(' · ');
}

interface ProcedureCardProps {
  procedure: StoredProcedure;
  onRemove: () => void;
}

export function ProcedureCard({ procedure, onRemove }: ProcedureCardProps) {
  return (
    <article className={`${LIST_CARD} flex min-w-0 flex-col gap-3 p-6`}>
      <h3 className="break-words text-xl font-bold">
        <Link href={`/procedimientos/${procedure.id}`} className={TILE_LINK}>
          {procedure.title}
        </Link>
      </h3>
      <p className="text-sm text-texto-suave">Versión {procedure.versionNumber} · borrador</p>
      {procedure.description && (
        <p className="line-clamp-2 break-words">{procedure.description}</p>
      )}
      <p className="flex">
        <span className={`${CHIP} bg-chip-area text-chip-area-texto`}>{summary(procedure)}</span>
      </p>
      <footer className={`${LIST_CARD_LAYER} flex`}>
        <button type="button" className={LIST_BUTTON_SMALL} onClick={onRemove}>
          Quitar de la lista
        </button>
      </footer>
    </article>
  );
}
