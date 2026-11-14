import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import { createHttpUsersDirectory } from '@/lib/directory/http-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';

const areaA = AREA_IDS.ventas;
const areaB = AREA_IDS.operaciones;
const candidate = {
  id: FIXTURE_USERS.supervisorVentas.id,
  name: FIXTURE_USERS.supervisorVentas.name,
  role: FIXTURE_USERS.supervisorVentas.role,
};

function setup() {
  const request = vi.fn().mockResolvedValue([candidate]);
  const directory = createHttpUsersDirectory({ request } as ApiClient);
  return { request, directory };
}

describe('T29: directorio HTTP de candidatos', () => {
  test('una sola área: solicita GET /api/users?areaIds=... sin campos extra', async () => {
    const { directory, request } = setup();
    await expect(directory.listOwnerCandidates([areaA])).resolves.toEqual([candidate]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(`/api/users?areaIds=${areaA}`);
  });

  test('dos áreas: repite areaIds en el mismo orden y deduplica IDs repetidos', async () => {
    const { directory, request } = setup();
    await directory.listOwnerCandidates([areaA, areaB, areaA]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      `/api/users?areaIds=${areaA}&areaIds=${areaB}`,
    );
  });

  test('sin áreas no consulta la API ni inventa candidatos ADMIN', async () => {
    const { directory, request } = setup();
    await expect(directory.listOwnerCandidates([])).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  test('propaga errores del backend (400, 401, 403, 503), sin simular datos', async () => {
    for (const code of [400, 401, 403, 503]) {
      const { directory, request } = setup();
      const error = new ApiError(code);
      request.mockRejectedValue(error);
      await expect(directory.listOwnerCandidates([areaA])).rejects.toBe(error);
    }
  });

  test('getNames consulta GET /api/users/names?ids=... y deduplica IDs', async () => {
    const { directory, request } = setup();
    const otherId = FIXTURE_USERS.empleadoVentas.id;
    request.mockResolvedValueOnce({
      [candidate.id]: candidate.name,
      [otherId]: FIXTURE_USERS.empleadoVentas.name,
    });

    await expect(directory.getNames([candidate.id, otherId, candidate.id])).resolves.toEqual({
      [candidate.id]: candidate.name,
      [otherId]: FIXTURE_USERS.empleadoVentas.name,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(`/api/users/names?ids=${candidate.id}&ids=${otherId}`);
  });

  test('getNames con lista vacía devuelve {} sin consultar la API', async () => {
    const { directory, request } = setup();
    await expect(directory.getNames([])).resolves.toEqual({});
    expect(request).not.toHaveBeenCalled();
  });
});
