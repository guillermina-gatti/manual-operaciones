// Áreas y usuarios simulados (plan 002, sección 3.3). Mismos UUID que apps/api/src/documents/adapters/fixtures.ts,
// así un responsable elegido en la web también es válido para la API simulada. 0a… son áreas y 0b… son usuarios.
import type { Role } from '@/lib/session/session';

export interface FixtureUser {
  id: string;
  name: string;
  role: Role;
  areaIds: string[];
}

export const AREA_IDS = {
  ventas: '0a000000-0000-4000-8000-000000000001',
  operaciones: '0a000000-0000-4000-8000-000000000002',
} as const;

export const AREAS = [
  { id: AREA_IDS.ventas, name: 'Ventas' },
  { id: AREA_IDS.operaciones, name: 'Operaciones' },
];

export const FIXTURE_USERS = {
  admin: {
    id: '0b000000-0000-4000-8000-000000000001',
    name: 'Ana Administradora',
    role: 'ADMIN',
    areaIds: [],
  },
  supervisorVentas: {
    id: '0b000000-0000-4000-8000-000000000002',
    name: 'Sergio Supervisor de Ventas',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.ventas],
  },
  empleadoVentas: {
    id: '0b000000-0000-4000-8000-000000000003',
    name: 'Elena Empleada de Ventas',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.ventas],
  },
  supervisorOperaciones: {
    id: '0b000000-0000-4000-8000-000000000004',
    name: 'Sofía Supervisora de Operaciones',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.operaciones],
  },
  empleadoOperaciones: {
    id: '0b000000-0000-4000-8000-000000000005',
    name: 'Emilio Empleado de Operaciones',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.operaciones],
  },
} satisfies Record<string, FixtureUser>;
