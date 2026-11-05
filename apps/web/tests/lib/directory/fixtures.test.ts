import { describe, expect, test } from 'vitest';
import { AREAS, AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';

// Copiados de apps/api/src/documents/adapters/fixtures.ts. Si cambian allá, este test avisa
// que el frontend quedó desalineado: un responsable elegido acá sería inválido para la API.
const API_AREA_IDS = {
  ventas: '0a000000-0000-4000-8000-000000000001',
  operaciones: '0a000000-0000-4000-8000-000000000002',
};

const API_USERS = {
  admin: { id: '0b000000-0000-4000-8000-000000000001', role: 'ADMIN', areaIds: [] },
  supervisorVentas: {
    id: '0b000000-0000-4000-8000-000000000002',
    role: 'SUPERVISOR',
    areaIds: [API_AREA_IDS.ventas],
  },
  empleadoVentas: {
    id: '0b000000-0000-4000-8000-000000000003',
    role: 'EMPLOYEE',
    areaIds: [API_AREA_IDS.ventas],
  },
  supervisorOperaciones: {
    id: '0b000000-0000-4000-8000-000000000004',
    role: 'SUPERVISOR',
    areaIds: [API_AREA_IDS.operaciones],
  },
  empleadoOperaciones: {
    id: '0b000000-0000-4000-8000-000000000005',
    role: 'EMPLOYEE',
    areaIds: [API_AREA_IDS.operaciones],
  },
};

describe('fixtures del frontend', () => {
  test('las áreas tienen los UUID de la API y un nombre', () => {
    expect(AREA_IDS).toEqual(API_AREA_IDS);
    expect(AREAS).toEqual([
      { id: API_AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: API_AREA_IDS.operaciones, name: 'Operaciones', isActive: true },
    ]);
  });

  test('los usuarios tienen el mismo id, rol y áreas que en la API', () => {
    expect(Object.keys(FIXTURE_USERS)).toEqual(Object.keys(API_USERS));
    for (const [key, apiUser] of Object.entries(API_USERS)) {
      const user = FIXTURE_USERS[key as keyof typeof FIXTURE_USERS];
      expect({ id: user.id, role: user.role, areaIds: user.areaIds }).toEqual(apiUser);
    }
  });

  test('cada usuario tiene un nombre para mostrar', () => {
    for (const user of Object.values(FIXTURE_USERS)) {
      expect(user.name.trim()).not.toBe('');
    }
  });
});
