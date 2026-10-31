import { afterEach, describe, expect, test, vi } from 'vitest';
import { usersDirectory } from '@/lib/directory';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';

afterEach(() => {
  vi.useRealTimers();
});

describe('directorio de áreas simulado', () => {
  test('listAreas devuelve Ventas y Operaciones', async () => {
    const areas = await createFakeAreasDirectory({ delayMs: 0 }).listAreas();

    expect(areas).toEqual([
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: true },
    ]);
  });
});

describe('directorio de usuarios simulado', () => {
  const directory = createFakeUsersDirectory({ delayMs: 0 });

  test('listOwnerCandidates devuelve { id, name, role }, sin las áreas de cada usuario', async () => {
    const candidates = await directory.listOwnerCandidates([AREA_IDS.ventas]);

    expect(candidates).toEqual([
      { id: FIXTURE_USERS.admin.id, name: 'Ana Administradora', role: 'ADMIN' },
      { id: FIXTURE_USERS.supervisorVentas.id, name: 'Sergio Supervisor de Ventas', role: 'SUPERVISOR' },
      { id: FIXTURE_USERS.empleadoVentas.id, name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
    ]);
  });

  test('getNames devuelve los nombres pedidos y omite los IDs desconocidos', async () => {
    const names = await directory.getNames([
      FIXTURE_USERS.admin.id,
      '99999999-9999-4999-8999-999999999999',
      FIXTURE_USERS.empleadoOperaciones.id,
    ]);

    expect(names).toEqual({
      [FIXTURE_USERS.admin.id]: 'Ana Administradora',
      [FIXTURE_USERS.empleadoOperaciones.id]: 'Emilio Empleado de Operaciones',
    });
  });
});

describe('instancias de @/lib/directory', () => {
  test('T29 todavía usa la demora simulada para candidatos', async () => {
    vi.useFakeTimers();
    const resolved = vi.fn();

    const candidates = usersDirectory.listOwnerCandidates([AREA_IDS.ventas]).then(resolved);

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await candidates;
    expect(resolved).toHaveBeenCalledTimes(1);
  });
});
