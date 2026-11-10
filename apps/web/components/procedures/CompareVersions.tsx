'use client';

// Compare two versions of the procedure (spec 015, R10): a selector for each side and the result
// below. It starts with the version before the newest against the newest. With one version there is
// nothing to compare.
import { useId, useState } from 'react';
import { INPUT, LABEL } from '@/components/documents/design';
import { LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import type { VersionHistoryItem } from '@/lib/procedures';
import { versionSummary, newestFirst } from '@/lib/procedures/versions';
import { CompareResult } from './CompareResult';
import { Notice } from './Notice';
import { useCompareVersions } from './useCompareVersions';

interface SelectProps {
  label: string;
  value: string;
  versions: readonly VersionHistoryItem[];
  onChange: (id: string) => void;
}

function VersionSelect({ label, value, versions, onChange }: SelectProps) {
  const id = useId();
  return (
    <p className="flex min-w-0 flex-1 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} className={INPUT} value={value} onChange={(event) => onChange(event.target.value)}>
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {versionSummary(version.versionNumber, version.status)}
          </option>
        ))}
      </select>
    </p>
  );
}

export function CompareVersions({
  procedureId,
  versions,
}: {
  procedureId: string;
  versions: readonly VersionHistoryItem[];
}) {
  const titleId = useId();
  const sorted = newestFirst(versions);
  const [chosen, setChosen] = useState<{ from?: string; to?: string }>({});
  const { result, error, busy, compare, reset } = useCompareVersions(procedureId);

  if (sorted.length < 2) return null;
  const from = chosen.from ?? sorted[1].id;
  const to = chosen.to ?? sorted[0].id;
  const choose = (side: 'from' | 'to') => (id: string) => {
    setChosen({ from, to, [side]: id });
    reset();
  };

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4 border-t border-borde pt-5">
      <h3 id={titleId} className="text-lg font-bold">
        Comparar versiones
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <VersionSelect label="Desde" value={from} versions={sorted} onChange={choose('from')} />
        <VersionSelect label="Hasta" value={to} versions={sorted} onChange={choose('to')} />
        <button
          type="button"
          className={LIST_BUTTON_SECONDARY}
          disabled={busy || from === to}
          aria-busy={busy}
          onClick={() => void compare(from, to)}
        >
          Comparar
        </button>
      </div>
      {from === to && <p className="text-texto-suave">Elegí dos versiones distintas.</p>}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {result && <CompareResult comparison={result} />}
    </section>
  );
}
