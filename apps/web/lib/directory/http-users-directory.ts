// T29: candidatos a responsables desde la API real; getNames es un contrato separado (A-06.4).
import type { ApiClient } from '@/lib/api/client';
import type { DirectoryUser, UsersDirectory } from './users-directory';

export function createHttpUsersDirectory(
  client: ApiClient,
  namesDirectory: Pick<UsersDirectory, 'getNames'>,
): UsersDirectory {
  return {
    listOwnerCandidates(areaIds: string[]): Promise<DirectoryUser[]> {
      // OwnerField no consulta sin áreas. Se evita igualmente enviar un GET inválido a la API.
      const uniqueIds = [...new Set(areaIds)];
      if (uniqueIds.length === 0) return Promise.resolve([]);
      const params = new URLSearchParams();
      for (const id of uniqueIds) params.append('areaIds', id);
      return client.request<DirectoryUser[]>(`/api/users?${params.toString()}`);
    },
    // No existe aún el endpoint HTTP de nombres históricos. No confundir con candidatos:
    // listar solo activos no permite resolver el nombre de un responsable histórico inactivo.
    getNames(ids: string[]): Promise<Record<string, string>> {
      return namesDirectory.getNames(ids);
    },
  };
}
