// T28: directorio de áreas contra la API real. El cliente central agrega JWT y renueva la sesión.
import type { ApiClient } from '@/lib/api/client';
import type { Area, AreasDirectory } from './areas-directory';

export function createHttpAreasDirectory(client: ApiClient): AreasDirectory {
  return {
    listAreas(): Promise<Area[]> {
      return client.request<Area[]>('/api/areas');
    },
  };
}
