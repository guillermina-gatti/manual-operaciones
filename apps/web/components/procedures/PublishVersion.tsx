'use client';

// Publish the draft (spec 015, R2 and R5): the button "Publicar" and, before anything happens, a
// confirmation that says what changes, with the mark of a critical change and its summary. The API
// decides; its errors are said here.
import { useState } from 'react';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import type { VersionHistoryItem } from '@/lib/procedures';
import { validateChangeSummary } from '@/lib/procedures/change-summary';
import { CriticalChange } from './CriticalChange';
import { Notice } from './Notice';
import { usePublishVersion } from './usePublishVersion';

interface PublishVersionProps {
  procedureId: string;
  // The draft.
  version: VersionHistoryItem;
  // There is a published version that this one replaces: the first publication has none.
  replacesPublished: boolean;
  // The draft was published: the screen asks the history again.
  onPublished: () => void;
}

export function PublishVersion({ procedureId, version, replacesPublished, onPublished }: PublishVersionProps) {
  const [confirming, setConfirming] = useState(false);
  const [critical, setCritical] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState<string | undefined>();
  const { busy, error, publish, clearError } = usePublishVersion(procedureId, version.id, onPublished);

  // A critical change needs its summary (R5); a normal one is sent with nothing else.
  async function confirm() {
    const problem = critical ? validateChangeSummary(summary) : null;
    setSummaryError(problem ?? undefined);
    if (problem) return;
    const values = critical ? { isCritical: true, changeSummary: summary.trim() } : undefined;
    if (!(await publish(values))) setConfirming(false);
  }

  if (confirming) {
    return (
      <fieldset aria-label="Confirmar publicación" className="flex min-w-0 flex-wrap gap-3">
        <p className="basis-full font-semibold">
          ¿Publicar la versión {version.versionNumber}?{' '}
          {replacesPublished ? 'La versión vigente pasa a reemplazada.' : 'Va a ser la versión vigente.'}
        </p>
        <CriticalChange
          critical={critical}
          onCriticalChange={setCritical}
          summary={summary}
          onSummaryChange={setSummary}
          summaryError={summaryError}
        />
        <button type="button" className={LIST_BUTTON_PRIMARY} onClick={confirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Publicando…' : 'Sí, publicar'}
        </button>
        <button type="button" className={LIST_BUTTON_SECONDARY} onClick={() => setConfirming(false)} disabled={busy}>
          Cancelar
        </button>
      </fieldset>
    );
  }

  return (
    <>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <button
        type="button"
        className={`${LIST_BUTTON_PRIMARY} self-start`}
        onClick={() => {
          clearError();
          setConfirming(true);
        }}
      >
        Publicar
      </button>
    </>
  );
}
