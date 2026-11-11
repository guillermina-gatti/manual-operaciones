'use client';

// The detail of a procedure, read from the API (spec 006, HU11: W5, W6 and W7). The API decides what
// the user can see; a 404 comes as an error of the resource. Reloading asks again and, meanwhile,
// keeps the last procedure on screen, so a form that is open does not disappear. Without an id
// nothing is asked.
import { useState } from 'react';
import { useApiResource } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { getProcedure } from '@/lib/procedures';
import type { ProcedureDetail } from '@/lib/procedures';

interface LastDetail {
  id: string | null;
  data: ProcedureDetail;
}

export function useProcedureDetail(id: string | null): ApiResource<ProcedureDetail> {
  const resource = useApiResource(id && `procedure:${id}`, (signal) => getProcedure(id ?? '', signal));
  const [last, setLast] = useState<LastDetail | null>(null);

  // Keeping the last one is derived state: it is set while rendering, as React recommends.
  if (resource.status === 'success' && last?.data !== resource.data) {
    setLast({ id, data: resource.data });
  }
  if (resource.status === 'loading' && last?.id === id) {
    return { status: 'success', data: last.data, error: null, reload: resource.reload };
  }
  return resource;
}
