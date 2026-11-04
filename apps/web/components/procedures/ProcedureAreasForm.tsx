'use client';

// The areas of the procedure (HU10, R11): the list comes from GET /api/areas, and the whole set that
// is chosen replaces the current one. AreasField shows an inactive area only if the procedure already
// has it, so a new inactive one cannot be chosen (the API says 400 anyway).
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AreasField } from '@/components/documents/AreasField';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { useApiResource } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { describeProcedureError, setAreas } from '@/lib/procedures';
import type { StoredProcedure } from '@/lib/procedures/session-list';
import { withAreas } from '@/lib/procedures/snapshot';

interface ProcedureAreasFormProps {
  procedure: StoredProcedure;
  // The new copy of the procedure after the API accepted the areas.
  onChange: (next: StoredProcedure) => void;
}

export function ProcedureAreasForm(props: ProcedureAreasFormProps) {
  const areas = useApiResource('procedure-areas', () => areasDirectory.listAreas());

  if (areas.status === 'loading' || areas.status === 'idle') {
    return <ScreenState kind="loading" label="Cargando las áreas…" />;
  }
  if (areas.status === 'error') {
    return <ScreenState kind="error" message="No pudimos cargar las áreas." onRetry={areas.reload} />;
  }
  return <AreasForm {...props} areas={areas.data} />;
}

function AreasForm({ procedure, onChange, areas }: ProcedureAreasFormProps & { areas: Area[] }) {
  const [areaIds, setAreaIds] = useState(procedure.areaIds);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stops a second click that arrives before React renders the disabled button.
  const savingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await setAreas(procedure.id, areaIds);
      onChange(withAreas(procedure, result.areaIds));
      setAreaIds(result.areaIds);
      setSaved(true);
    } catch (failure) {
      setError(describeProcedureError(failure, 'areas').message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <AreasField areas={areas} selected={areaIds} onChange={setAreaIds} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Un procedimiento puede quedar sin áreas, pero no se podrá publicar sin al menos una (HU32).
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900 shadow-sm dark:border-green-900 dark:bg-green-950/60 dark:text-green-100"
        >
          Áreas guardadas.
        </p>
      )}

      <Button type="submit" className="self-start" disabled={saving} aria-busy={saving}>
        {saving ? 'Guardando…' : 'Guardar áreas'}
      </Button>
    </form>
  );
}
