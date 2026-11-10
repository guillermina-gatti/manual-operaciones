'use client';

// The areas of the procedure (HU10, R11): the list comes from GET /api/areas, and the whole set that
// is chosen replaces the current one. AreasField shows an inactive area only if the procedure already
// has it, so a new inactive one cannot be chosen (the API says 400 anyway).
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AreasField } from '@/components/documents/AreasField';
import { HINT } from '@/components/documents/design';
import { LIST_BUTTON_PRIMARY } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import { useApiResource } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import { describeProcedureError, setAreas } from '@/lib/procedures';
import type { StoredProcedure } from '@/lib/procedures/session-list';
import { withAreas } from '@/lib/procedures/snapshot';
import { Notice } from './Notice';
import { Skeleton } from './Skeleton';

interface ProcedureAreasFormProps {
  procedure: StoredProcedure;
  // The new copy of the procedure after the API accepted the areas.
  onChange: (next: StoredProcedure) => void;
}

export function ProcedureAreasForm(props: ProcedureAreasFormProps) {
  const areas = useApiResource('procedure-areas', () => areasDirectory.listAreas());

  if (areas.status === 'loading' || areas.status === 'idle') {
    return (
      <ScreenState kind="loading" label="Cargando las áreas…">
        <Skeleton heights={['h-12', 'h-12', 'h-12']} />
      </ScreenState>
    );
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
      <p className={HINT}>
        Un procedimiento puede quedar sin áreas, pero no se puede publicar sin al menos una.
      </p>

      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" role="status">
          Áreas guardadas.
        </Notice>
      )}

      <button
        type="submit"
        className={`${LIST_BUTTON_PRIMARY} self-start`}
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? 'Guardando…' : 'Guardar áreas'}
      </button>
    </form>
  );
}
