'use client';

// What can be done with the versions now (spec 015): publish the draft if there is one.
import type { VersionHistoryItem } from '@/lib/procedures';
import { findDraft } from '@/lib/procedures/versions';
import { PublishVersion } from './PublishVersion';

interface VersionActionsProps {
  procedureId: string;
  versions: readonly VersionHistoryItem[];
  // Something changed (a version was published): the screen asks the history again.
  onChanged: () => void;
}

export function VersionActions({ procedureId, versions, onChanged }: VersionActionsProps) {
  const draft = findDraft(versions);
  if (!draft) return null;
  return <PublishVersion procedureId={procedureId} version={draft} onPublished={onChanged} />;
}
