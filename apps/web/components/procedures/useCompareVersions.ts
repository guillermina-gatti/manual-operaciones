'use client';

// What comparing two versions does with the API (spec 015, R10): one comparison at a time, its result
// or the message of the error. `reset` clears the result when the versions chosen change.
import { useRef, useState } from 'react';
import { compareVersions, describeProcedureError } from '@/lib/procedures';
import type { VersionComparison } from '@/lib/procedures';

export function useCompareVersions(procedureId: string) {
  const [result, setResult] = useState<VersionComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Stops a second click that arrives before React renders the disabled button.
  const busyRef = useRef(false);

  async function compare(from: string, to: string): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await compareVersions(procedureId, from, to));
    } catch (failure) {
      setError(describeProcedureError(failure, 'versions').message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return { result, error, busy, compare, reset };
}
