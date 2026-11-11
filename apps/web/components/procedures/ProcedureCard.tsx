// One procedure of the list (spec 006, W4): title, version and its state, steps and areas. The whole
// card goes to the detail through the link of the title: the editor for an ADMIN, the read-only
// sheet for the rest (the page decides). It has no buttons: nothing is edited from the list.
import Link from 'next/link';
import { AreaChips, CHIP, StatusDot } from '@/components/documents/design';
import { LIST_CARD, META_LABEL, TILE_LINK } from '@/components/documents/list-design';
import type { ProcedureListItem } from '@/lib/procedures';
import { versionSummary } from '@/lib/procedures/versions';

export function stepCountLabel(count: number): string {
  if (count === 0) return 'sin pasos';
  return count === 1 ? '1 paso' : `${count} pasos`;
}

export function ProcedureCard({ procedure }: { procedure: ProcedureListItem }) {
  const { version, areas } = procedure;

  return (
    <article className={`${LIST_CARD} flex h-full min-w-0 flex-col gap-4 p-6`}>
      <header className="flex min-w-0 flex-col gap-2">
        <h3 className="min-w-0 break-words text-xl leading-snug font-bold">
          <Link href={`/procedimientos/${procedure.id}`} title={version.title} className={TILE_LINK}>
            {version.title}
          </Link>
        </h3>
        <p className="text-base text-texto-suave">
          {versionSummary(version.versionNumber, version.status)}
        </p>
        {procedure.hasOpenDraft && <StatusDot tone="azul">Borrador abierto</StatusDot>}
      </header>

      {version.description && <p className="line-clamp-2 break-words">{version.description}</p>}

      <p className="flex">
        <span className={`${CHIP} bg-fondo text-texto`}>{stepCountLabel(version.stepCount)}</span>
      </p>

      <dl className="mt-auto flex min-w-0 flex-col gap-1 border-t border-borde pt-4">
        <dt className={META_LABEL}>Áreas</dt>
        <dd className="min-w-0">
          <AreaChips areas={areas} />
        </dd>
      </dl>
    </article>
  );
}
