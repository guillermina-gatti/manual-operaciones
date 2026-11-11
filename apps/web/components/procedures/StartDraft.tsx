'use client';

// The way into a draft (spec 015, R7): "Crear nueva versión" when there is no draft, and "Editar el
// borrador" when there is one that this screen does not have yet.
import { LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import type { VersionDetail, VersionHistoryItem } from '@/lib/procedures';
import { Notice } from './Notice';
import { useStartDraft } from './useStartDraft';

interface StartDraftProps {
  procedureId: string;
  // The draft that already exists, if any.
  draft?: VersionHistoryItem;
  // The draft is ready: the screen follows it.
  onStarted: (draft: VersionDetail) => void;
}

export function StartDraft({ procedureId, draft, onStarted }: StartDraftProps) {
  const { busy, error, start } = useStartDraft(procedureId, onStarted);
  return (
    <>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <button
        type="button"
        className={`${LIST_BUTTON_SECONDARY} self-start`}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void start(draft?.id)}
      >
        {draft ? 'Editar el borrador' : 'Crear nueva versión'}
      </button>
    </>
  );
}
