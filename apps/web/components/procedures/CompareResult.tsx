// What changed between two versions (spec 015, R10): the steps added, removed and modified, each group
// with its count, and how many are the same. A group with nothing in it is not shown. Only the view.
import { useId } from 'react';
import type { ReactNode } from 'react';
import type { VersionComparison } from '@/lib/procedures';
import { describeChange, hasDifferences, modifiedTitle } from '@/lib/procedures/comparison';
import { VERSION_LABELS } from '@/lib/procedures/versions';

const GROUP_TITLE = 'text-lg font-bold';

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const id = useId();
  if (count === 0) return null;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h4 id={id} className={GROUP_TITLE}>
        {`${title} · ${count}`}
      </h4>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function Step({ title, note }: { title: string; note?: string }) {
  return (
    <li className="flex min-w-0 flex-col rounded-xl bg-fondo p-3">
      <span className="break-words font-semibold">{title}</span>
      {note && <span className="text-texto-suave">{note}</span>}
    </li>
  );
}

const side = ({ versionNumber, status }: VersionComparison['from']) =>
  `la versión ${versionNumber} (${VERSION_LABELS[status].toLowerCase()})`;

export function CompareResult({ comparison }: { comparison: VersionComparison }) {
  const { added, removed, modified, unchanged } = comparison;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-texto-suave">{`De ${side(comparison.from)} a ${side(comparison.to)}`}</p>
      {!hasDifferences(comparison) && <p className="font-semibold">Las dos versiones tienen los mismos pasos.</p>}
      <Group title="Agregados" count={added.length}>
        {added.map((step) => <Step key={step.id} title={step.title} />)}
      </Group>
      <Group title="Quitados" count={removed.length}>
        {removed.map((step) => <Step key={step.id} title={step.title} />)}
      </Group>
      <Group title="Modificados" count={modified.length}>
        {modified.map((item) => (
          <Step key={item.after.id} title={modifiedTitle(item)} note={describeChange(item)} />
        ))}
      </Group>
      {unchanged > 0 && (
        <p className="text-texto-suave">{`${unchanged} ${unchanged === 1 ? 'paso sin cambios' : 'pasos sin cambios'}`}</p>
      )}
    </div>
  );
}
