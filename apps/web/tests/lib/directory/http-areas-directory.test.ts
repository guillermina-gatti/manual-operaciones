import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import { toAreaNameMap } from '@/lib/directory/areas-directory';
import { createHttpAreasDirectory } from '@/lib/directory/http-areas-directory';

const catalog = [
  { id: '0a000000-0000-4000-8000-000000000002', name: 'Operaciones', isActive: false },
  { id: '0a000000-0000-4000-8000-000000000001', name: 'Ventas', isActive: true },
];

describe('T28: directorio HTTP de áreas', () => {
  test('usa el apiClient compartido y no filtra las áreas históricas', async () => {
    const request = vi.fn().mockResolvedValue(catalog);
    const directory = createHttpAreasDirectory({ request } as ApiClient);

    await expect(directory.listAreas()).resolves.toEqual(catalog);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/areas');
  });

  test('propaga un 401 o 503: no cambia el error por una lista vacía', async () => {
    for (const status of [401, 503]) {
      const failure = new ApiError(status);
      const request = vi.fn().mockRejectedValue(failure);
      const directory = createHttpAreasDirectory({ request } as ApiClient);

      await expect(directory.listAreas()).rejects.toBe(failure);
    }
  });

  test('arma etiquetas históricas sin alterar los nombres de la API', () => {
    expect(toAreaNameMap(catalog)).toEqual({
      [catalog[0].id]: 'Operaciones (inactiva)',
      [catalog[1].id]: 'Ventas',
    });
    expect(catalog[0].name).toBe('Operaciones');
  });
});
