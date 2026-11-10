'use client';

// What publishing a draft does with the API (spec 015, R2 and R5): one publication at a time, and
// the message of the error if it fails. The screen tells what changed through onPublished.
import { useRef, useState } from 'react';
import { describeProcedureError, publishVersion } from '@/lib/procedures';
import type { PublishValues } from '@/lib/procedures';

export function usePublishVersion(procedureId: string, versionId: string, onPublished: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stops a second click that arrives before React renders the disabled button.
  const busyRef = useRef(false);

  // Without values it publishes a normal change. Says whether it was published.
  async function publish(values?: PublishValues): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await (values ? publishVersion(procedureId, versionId, values) : publishVersion(procedureId, versionId));
      onPublished();
      return true;
    } catch (failure) {
      setError(describeProcedureError(failure, 'publish').message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return { busy, error, publish, clearError: () => setError(null) };
}
