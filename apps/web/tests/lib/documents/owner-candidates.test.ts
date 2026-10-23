import { describe, expect, test } from 'vitest';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import { canBeOwner, filterOwnerCandidates } from '@/lib/documents/owner-candidates';

const USERS = Object.values(FIXTURE_USERS);
const names = (users: { name: string }[]) => users.map((user) => user.name);

describe('filterOwnerCandidates (F11)', () => {
  test('E3: con Ventas no aparece el EMPLOYEE de Operaciones y sí el ADMIN', () => {
    const candidates = filterOwnerCandidates(USERS, [AREA_IDS.ventas]);

    expect(names(candidates)).toEqual([
      'Ana Administradora',
      'Sergio Supervisor de Ventas',
      'Elena Empleada de Ventas',
    ]);
    expect(candidates).not.toContain(FIXTURE_USERS.empleadoOperaciones);
  });

  test('con Ventas y Operaciones aparecen los usuarios de las dos áreas', () => {
    const candidates = filterOwnerCandidates(USERS, [AREA_IDS.ventas, AREA_IDS.operaciones]);

    expect(candidates).toEqual(USERS);
  });

  test('con un área sin usuarios, solo los ADMIN (caso borde)', () => {
    const candidates = filterOwnerCandidates(USERS, ['0a000000-0000-4000-8000-000000000099']);

    expect(names(candidates)).toEqual(['Ana Administradora']);
  });

  test('sin áreas, solo los ADMIN: igual que la API', () => {
    expect(names(filterOwnerCandidates(USERS, []))).toEqual(['Ana Administradora']);
  });

  test('no modifica la lista recibida', () => {
    const copy = [...USERS];

    filterOwnerCandidates(USERS, [AREA_IDS.ventas]);

    expect(USERS).toEqual(copy);
  });
});

// Los mismos casos que prueba la API para canBeOwner (apps/api/src/documents/document-access.policy.ts, R5).
describe('canBeOwner: la misma regla que la API (R5 de la spec 001)', () => {
  test('un ADMIN sin áreas puede ser responsable de cualquier documento', () => {
    expect(canBeOwner(FIXTURE_USERS.admin, [AREA_IDS.operaciones])).toBe(true);
  });

  test('un SUPERVISOR de un área compartida puede ser responsable', () => {
    expect(
      canBeOwner(FIXTURE_USERS.supervisorVentas, [AREA_IDS.ventas, AREA_IDS.operaciones]),
    ).toBe(true);
  });

  test('un EMPLOYEE de otra área no puede ser responsable', () => {
    expect(canBeOwner(FIXTURE_USERS.empleadoOperaciones, [AREA_IDS.ventas])).toBe(false);
  });

  test('sin áreas en el documento, solo un ADMIN', () => {
    expect(canBeOwner(FIXTURE_USERS.empleadoVentas, [])).toBe(false);
    expect(canBeOwner(FIXTURE_USERS.admin, [])).toBe(true);
  });
});
