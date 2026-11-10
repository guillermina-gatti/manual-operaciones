'use client';

// The versions of a procedure, newest first (spec 015, R8). One page of up to 100 is enough: a
// procedure does not get that many versions. Reloading asks the API again. Without an id (a
// procedure that is not known) nothing is asked.
import { useApiResource } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { listVersions } from '@/lib/procedures';
import type { VersionHistoryItem } from '@/lib/procedures';
import { newestFirst } from '@/lib/procedures/versions';

export function useVersions(procedureId: string | null): ApiResource<VersionHistoryItem[]> {
  return useApiResource(procedureId && `procedure-versions:${procedureId}`, async (signal) =>
    newestFirst((await listVersions(procedureId ?? '', { limit: 100 }, signal)).data),
  );
}
