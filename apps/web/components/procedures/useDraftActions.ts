// What the draft form does with the API (HU09, R5 and R10): save the title and the description, and
// discard the draft. One action at a time; every answer of the API gives the new copy of the procedure
// to onChange.
import { useLayoutEffect, useRef, useState } from 'react';
import { describeProcedureError, discardDraft, updateVersion } from '@/lib/procedures';
import type { UpdateVersionValues } from '@/lib/procedures';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { withDraft } from '@/lib/procedures/snapshot';
import type { FormValues } from '@/lib/procedures/validate';

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
  async function run<T>(kind: 'save' | 'discard', action: () => Promise<T>): Promise<{ value: T } | null> {
    busyRef.current = true;
    const visit = visitRef.current;
    setBusy(kind);
    try {
      return { value: await action() };
    } catch (error) {
      if (visitRef.current === visit) {
        setFailure(describeProcedureError(error, kind === 'save' ? 'draft' : 'discard'));
      }
      return null;
    } finally {
      if (visitRef.current === visit) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  // The values were already checked. Gives back what the API saved, or null if nothing was saved.
  async function save(values: FormValues): Promise<FormValues | null> {
    if (busyRef.current) return null;
    // The API asks for at least one field (R5): only what changed is sent.
    const changes: UpdateVersionValues = {};
    if (values.title.trim() !== procedure.title) changes.title = values.title.trim();
    if (values.description.trim() !== (procedure.description ?? '')) {
      changes.description = values.description.trim();
    }
    if (Object.keys(changes).length === 0) {
      setNotice('No hay cambios para guardar.');
      return null;
    }

    const visit = visitRef.current;
    const result = await run('save', () =>
      updateVersion(procedure.id, procedure.versionId, changes),
    );
    if (!result) return null;
    const updated = result.value;
    onChange(withDraft(procedure, updated));
    if (visitRef.current !== visit) return null;
    setNotice('Cambios guardados.');
    return { title: updated.title, description: updated.description ?? '' };
  }

  // Says whether the draft is gone.
  async function discard(): Promise<boolean> {
    if (busyRef.current) return false;
    clearMessages();
    const result = await run('discard', () => discardDraft(procedure.id, procedure.versionId));
    if (!result) return false;
    onGone();
    return true;
  }

  return { busy, notice, failure, clearMessages, save, discard };
}
