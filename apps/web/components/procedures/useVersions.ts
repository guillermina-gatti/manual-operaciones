'use client';

// The versions of a procedure, newest first (spec 015, R8). One page of up to 100 is enough: a
// procedure does not get that many versions. Reloading asks the API again and, meanwhile, keeps
// the last list on screen, so the timeline does not blink. Without an id (a procedure that is not
// known) nothing is asked.
import { useState } from 'react';
import { useApiResource } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { listVersions } from '@/lib/procedures';
import type { VersionHistoryItem } from '@/lib/procedures';
import { newestFirst } from '@/lib/procedures/versions';

interface LastList {
  procedureId: string | null;
  data: VersionHistoryItem[];
}

export function useVersions(procedureId: string | null): ApiResource<VersionHistoryItem[]> {
  const resource = useApiResource(procedureId && `procedure-versions:${procedureId}`, async (signal) =>
    newestFirst((await listVersions(procedureId ?? '', { limit: 100 }, signal)).data),
  );
  const [last, setLast] = useState<LastList | null>(null);

  // Keeping the last list is derived state: it is set while rendering, as React recommends.
  if (resource.status === 'success' && last?.data !== resource.data) {
    setLast({ procedureId, data: resource.data });
  }
  if (resource.status === 'loading' && last?.procedureId === procedureId) {
    return { status: 'success', data: last.data, error: null, reload: resource.reload };
  }
  return resource;
}
