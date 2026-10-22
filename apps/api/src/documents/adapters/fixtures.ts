import type { DirectoryUser } from '../ports/users-directory';

// UUID fijos, escritos a mano, para que los tests y el desarrollo den siempre lo mismo.
// 0a… son áreas y 0b… son usuarios.
export const AREA_IDS = {
  ventas: '0a000000-0000-4000-8000-000000000001',
  operaciones: '0a000000-0000-4000-8000-000000000002',
} as const;

export const FIXTURE_USERS = {
  admin: {
    id: '0b000000-0000-4000-8000-000000000001',
    role: 'ADMIN',
    areaIds: [],
  },
  supervisorVentas: {
    id: '0b000000-0000-4000-8000-000000000002',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.ventas],
  },
  empleadoVentas: {
    id: '0b000000-0000-4000-8000-000000000003',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.ventas],
  },
  supervisorOperaciones: {
    id: '0b000000-0000-4000-8000-000000000004',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.operaciones],
  },
  empleadoOperaciones: {
    id: '0b000000-0000-4000-8000-000000000005',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.operaciones],
  },
} satisfies Record<string, DirectoryUser>;
