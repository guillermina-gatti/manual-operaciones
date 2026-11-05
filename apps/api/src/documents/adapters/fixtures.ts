/*Datos de prueba y fixtures estáticos de usuarios y áreas */
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
    name: 'Ana Administradora',
    role: 'ADMIN',
    areaIds: [],
    isActive: true,
  },
  supervisorVentas: {
    id: '0b000000-0000-4000-8000-000000000002',
    name: 'Sergio Supervisor de Ventas',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.ventas],
    isActive: true,
  },
  empleadoVentas: {
    id: '0b000000-0000-4000-8000-000000000003',
    name: 'Elena Empleada de Ventas',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.ventas],
    isActive: true,
  },
  supervisorOperaciones: {
    id: '0b000000-0000-4000-8000-000000000004',
    name: 'Sofía Supervisora de Operaciones',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.operaciones],
    isActive: true,
  },
  empleadoOperaciones: {
    id: '0b000000-0000-4000-8000-000000000005',
    name: 'Emilio Empleado de Operaciones',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.operaciones],
    isActive: true,
  },
} satisfies Record<string, DirectoryUser>;
