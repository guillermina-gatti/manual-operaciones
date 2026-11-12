// The read-only sheet of a procedure (spec 006, W5): big title, "Versión N · publicada", areas as
// chips, the description and the numbered steps. Nothing here changes anything. It has no box of its
// own: the main of the page lays its parts out.
import Link from 'next/link';
import { useId } from 'react';
import { AreaChips, BACK_LINK } from '@/components/documents/design';
import { META_LABEL, PageHeader } from '@/components/documents/list-design';
import type { ProcedureDetail } from '@/lib/procedures';
import { versionSummary } from '@/lib/procedures/versions';
import { SECTION, SECTION_TITLE } from './design';
import { ProcedureStepCards } from './ProcedureStepCards';

export function ProcedureSheet({ procedure }: { procedure: ProcedureDetail }) {
  const baseId = useId();
  const { version, areas } = procedure;

  return (
    <>
      <Link href="/procedimientos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
      </Link>

      <PageHeader
        wrap
        title={version.title}
        subtitle={versionSummary(version.versionNumber, version.status)}
      />

      <section aria-labelledby={`${baseId}-about`} className={SECTION}>
        <h2 id={`${baseId}-about`} className={SECTION_TITLE}>
          Sobre este procedimiento
        </h2>
        {version.description && <p className="whitespace-pre-line break-words">{version.description}</p>}
        <dl className="flex min-w-0 flex-col gap-1">
          <dt className={META_LABEL}>Áreas</dt>
          <dd className="min-w-0">
            <AreaChips areas={areas} />
          </dd>
        </dl>
      </section>

      <section aria-labelledby={`${baseId}-steps`} className="flex flex-col gap-4">
        <h2 id={`${baseId}-steps`} className={SECTION_TITLE}>
          Pasos · {version.steps.length}
        </h2>
        <ProcedureStepCards steps={version.steps} />
      </section>
    </>
  );
}
