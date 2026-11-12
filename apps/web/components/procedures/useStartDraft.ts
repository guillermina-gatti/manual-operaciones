'use client';

// Start working on a draft (spec 006, R4 and spec 015, R7): create it from the published version
// (or take the one that already exists), read its steps and give it to the screen. One at a time.
import { useRef, useState } from 'react';
import { createVersionDraft, describeProcedureError, getVersion } from '@/lib/procedures';
import type { VersionDetail } from '@/lib/procedures';

export function useStartDraft(procedureId: string, onStarted: (draft: VersionDetail) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stops a second click that arrives before React renders the disabled button.
  const busyRef = useRef(false);

  // With a draftId it only reads that draft; without one it creates it first.
  async function start(draftId?: string): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const id = draftId ?? (await createVersionDraft(procedureId)).id;
      onStarted(await getVersion(procedureId, id));
    } catch (failure) {
      setError(describeProcedureError(failure, 'versions').message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return { busy, error, start };
}
