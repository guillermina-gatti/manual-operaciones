// What the draft form does with the API (HU09, R5 and R10): save the title and the description, and
// discard the draft. One action at a time; every answer of the API gives the new copy of the procedure
// to onChange.
import { useLayoutEffect, useRef, useState } from 'react';
import { describeProcedureError, discardDraft, setAreas, updateVersion } from '@/lib/procedures';
import type { ProcedureErrorContext } from '@/lib/procedures';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { withAreas, withDraft } from '@/lib/procedures/snapshot';
import { draftChanges } from '@/lib/procedures/draft-changes';
import type { DraftValues } from '@/lib/procedures/draft-changes';

export interface DraftFailure {
  message: string;
  notFound: boolean;
}

export function useDraftActions(
  procedure: EditableProcedure,
  onChange: (next: EditableProcedure) => void,
  onGone: () => void,
) {
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<DraftFailure | null>(null);
  // Stops a second click that arrives before React renders the disabled buttons.
  const busyRef = useRef(false);
  // Changes each time the screen is hidden, so a late answer from before is ignored.
  const visitRef = useRef(0);

  // With cacheComponents, Next hides this page with <Activity> when navigating away and shows the
  // same instance on return. The cleanup runs on hide: coming back starts without old messages.
  useLayoutEffect(
    () => () => {
      visitRef.current += 1;
      busyRef.current = false;
      setBusy(null);
      setNotice(null);
      setFailure(null);
    },
    [],
  );

  function clearMessages() {
    setNotice(null);
    setFailure(null);
  }

  // Runs one action. After leaving, the hide cleanup already reset the state, and a new action may be
  // running, so only the visit that started it touches the state. Gives the result, or null if it failed.
  async function run<T>(
    kind: 'save' | 'discard',
    context: ProcedureErrorContext,
    action: () => Promise<T>,
  ): Promise<{ value: T } | null> {
    busyRef.current = true;
    const visit = visitRef.current;
    setBusy(kind);
    try {
      return { value: await action() };
    } catch (error) {
      if (visitRef.current === visit) {
        setFailure(describeProcedureError(error, context));
      }
      return null;
    } finally {
      if (visitRef.current === visit) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  // The values were already checked. Gives back what was saved, or null if nothing was saved. The
  // version and the areas are two calls: each one gives its answer to the screen as soon as it is
  // accepted, so if the second fails the first is not lost.
  async function save(values: DraftValues): Promise<DraftValues | null> {
    if (busyRef.current) return null;
    const changes = draftChanges(procedure, values);
    if (!changes.hasVersion && !changes.areas) {
      setNotice('No hay cambios para guardar.');
      return null;
    }

    const visit = visitRef.current;
    let current = procedure;
    if (changes.hasVersion) {
      const done = await run('save', 'draft', () =>
        updateVersion(procedure.id, procedure.versionId, changes.version),
      );
      if (!done) return null;
      current = withDraft(current, done.value);
      onChange(current);
    }
    if (changes.areas) {
      const done = await run('save', 'areas', () => setAreas(procedure.id, values.areaIds));
      if (!done) return null;
      current = withAreas(current, done.value.areaIds);
      onChange(current);
    }
    if (visitRef.current !== visit) return null;
    setNotice('Cambios guardados.');
    return { title: current.title, description: current.description ?? '', areaIds: current.areaIds };
  }

  // Says whether the draft is gone.
  async function discard(): Promise<boolean> {
    if (busyRef.current) return false;
    clearMessages();
    const result = await run('discard', 'discard', () => discardDraft(procedure.id, procedure.versionId));
    if (!result) return false;
    onGone();
    return true;
  }

  return { busy, notice, failure, clearMessages, save, discard };
}
