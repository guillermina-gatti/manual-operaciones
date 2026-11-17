// One procedure of the list (spec 006, W4; spec 017, D2 to D4): title, version and its state as a chip,
// the steps as a trail of dots, and the areas, each with its own color. The whole card goes to the
// detail through the link of the title: the editor for an ADMIN, the read-only sheet for the rest (the
// page decides). It has no buttons: nothing is edited from the list.
import Link from 'next/link';
import { CHIP } from '@/components/documents/design';
import { LIST_CARD, META_LABEL, TILE_LINK } from '@/components/documents/list-design';
import type { ProcedureListItem } from '@/lib/procedures';
import { versionSummary } from '@/lib/procedures/versions';
import { ColoredAreaChips } from './design';

export function stepCountLabel(count: number): string {
  if (count === 0) return 'sin pasos';
  return count === 1 ? '1 paso' : `${count} pasos`;
}

// The state of the version: green when it is published, blue for a draft, beige for a replaced one.
const STATE_CHIPS = {
  PUBLISHED: { chip: 'bg-chip-area text-chip-area-texto', dot: 'bg-exito' },
  DRAFT: { chip: 'bg-[#E3EDFC] text-[#1D4ED8]', dot: 'bg-[#1D4ED8]' },
  SUPERSEDED: { chip: 'bg-[#ECE7DD] text-[#5F5747]', dot: 'bg-[#5F5747]' },
} as const;

function StateChip({ tone, children }: { tone: keyof typeof STATE_CHIPS; children: string }) {
  const { chip, dot } = STATE_CHIPS[tone];
  return (
    <span className={`${CHIP} gap-2 ${chip}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

const TRAIL_DOTS = 8;

// Orange dots with the number of each step, joined by a line: one per step and up to 8; with more, the
// last one says "+N". It is decorative: "N pasos" next to it says the count. The dark orange carries
// the white number (DESIGN.md: never text over the light orange).
function StepTrail({ count }: { count: number }) {
  if (count === 0) return null;
  const numbered = count > TRAIL_DOTS ? TRAIL_DOTS - 1 : count;
  const labels = Array.from({ length: numbered }, (_, index) => `${index + 1}`);
  if (count > TRAIL_DOTS) labels.push(`+${count - numbered}`);

  return (
    <span aria-hidden="true" className="flex items-center">
      {labels.map((label, index) => (
        <span key={label} className="flex items-center">
          {index > 0 && <span className="h-0.5 w-2 bg-naranja-boton/40" />}
          <span className="flex size-6 min-w-6 items-center justify-center rounded-full bg-naranja-boton px-1 text-xs font-bold text-blanco">
            {label}
          </span>
        </span>
      ))}
    </span>
  );
}

export function ProcedureCard({ procedure }: { procedure: ProcedureListItem }) {
  const { version, areas } = procedure;

  return (
    <article className={`${LIST_CARD} flex h-full min-w-0 flex-col gap-4 p-6 shadow-sm`}>
      <header className="flex min-w-0 flex-col gap-2">
        <h3 className="min-w-0 break-words text-xl leading-snug font-bold">
          <Link href={`/procedimientos/${procedure.id}`} title={version.title} className={TILE_LINK}>
            {version.title}
          </Link>
        </h3>
        <p className="flex flex-wrap gap-2">
          <StateChip tone={version.status}>{versionSummary(version.versionNumber, version.status)}</StateChip>
          {procedure.hasOpenDraft && <StateChip tone="DRAFT">Borrador abierto</StateChip>}
        </p>
      </header>

      {version.description && <p className="line-clamp-2 break-words">{version.description}</p>}

      <p className="flex flex-wrap items-center gap-3">
        <StepTrail count={version.stepCount} />
        <span className="text-sm font-semibold text-texto-suave">{stepCountLabel(version.stepCount)}</span>
      </p>

      <dl className="mt-auto flex min-w-0 flex-col gap-1 border-t border-borde pt-4">
        <dt className={META_LABEL}>Áreas</dt>
        <dd className="min-w-0">
          <ColoredAreaChips areas={areas} />
        </dd>
      </dl>
    </article>
  );
}
