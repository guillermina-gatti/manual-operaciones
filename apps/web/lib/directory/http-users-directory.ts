// T29 y A-06.4: directorio HTTP de candidatos y resolución real de nombres históricos.
import type { ApiClient } from '@/lib/api/client';
import type { DirectoryUser, UsersDirectory } from './users-directory';

function buildUuidQuery(paramName: string, ids: string[]): string | null {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return null;
  const params = new URLSearchParams();
  for (const id of uniqueIds) params.append(paramName, id);
  return params.toString();
}

export function createHttpUsersDirectory(client: ApiClient): UsersDirectory {
  return {
    listOwnerCandidates(areaIds: string[]): Promise<DirectoryUser[]> {
      const query = buildUuidQuery('areaIds', areaIds);
      if (!query) return Promise.resolve([]);
      return client.request<DirectoryUser[]>(`/api/users?${query}`);
    },
    getNames(ids: string[]): Promise<Record<string, string>> {
      const query = buildUuidQuery('ids', ids);
      if (!query) return Promise.resolve({});
      return client.request<Record<string, string>>(`/api/users/names?${query}`);
    },
  };
}
