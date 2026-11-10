'use client';

// What can be done with the versions now (spec 015): publish the draft this screen is editing, take
// a draft that exists elsewhere, or create a new one from the published version.
import type { VersionDetail, VersionHistoryItem } from '@/lib/procedures';
import { findDraft, hasPublished } from '@/lib/procedures/versions';
import { PublishVersion } from './PublishVersion';
import { StartDraft } from './StartDraft';

interface VersionActionsProps {
  procedureId: string;
  versions: readonly VersionHistoryItem[];
  // The version this screen is working on.
  currentVersionId: string;
  // Something changed (a version was published): the screen asks the history again.
  onChanged: () => void;
  // A draft is ready to be edited: the screen follows it.
  onDraftStarted: (draft: VersionDetail) => void;
}

export function VersionActions({
  procedureId,
  versions,
  currentVersionId,
  onChanged,
  onDraftStarted,
}: VersionActionsProps) {
  const draft = findDraft(versions);
  if (draft?.id === currentVersionId) {
    return <PublishVersion procedureId={procedureId} version={draft} onPublished={onChanged} />;
  }
  if (draft || hasPublished(versions)) {
    return <StartDraft procedureId={procedureId} draft={draft} onStarted={onDraftStarted} />;
  }
  return null;
}
