import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { Role, SessionUser } from '@/lib/session';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  areaIds: string[];
  areaNames: string[];
  isActive: boolean;
}

export const DEFAULT_MANAGED_USERS: readonly ManagedUser[] = [
  {
    id: FIXTURE_USERS.admin.id,
    name: FIXTURE_USERS.admin.name,
    email: 'admin@fixtures.test',
    role: 'ADMIN',
    areaIds: [],
    areaNames: ['Todas las áreas'],
    isActive: true,
  },
  {
    id: FIXTURE_USERS.supervisorVentas.id,
    name: FIXTURE_USERS.supervisorVentas.name,
    email: 'supervisorventas@fixtures.test',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.ventas],
    areaNames: ['Ventas'],
    isActive: true,
  },
  {
    id: FIXTURE_USERS.empleadoVentas.id,
    name: FIXTURE_USERS.empleadoVentas.name,
    email: 'empleadoventas@fixtures.test',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.ventas],
    areaNames: ['Ventas'],
    isActive: true,
  },
  {
    id: FIXTURE_USERS.supervisorOperaciones.id,
    name: FIXTURE_USERS.supervisorOperaciones.name,
    email: 'supervisoroperaciones@fixtures.test',
    role: 'SUPERVISOR',
    areaIds: [AREA_IDS.operaciones],
    areaNames: ['Operaciones'],
    isActive: true,
  },
  {
    id: FIXTURE_USERS.empleadoOperaciones.id,
    name: FIXTURE_USERS.empleadoOperaciones.name,
    email: 'empleadooperaciones@fixtures.test',
    role: 'EMPLOYEE',
    areaIds: [AREA_IDS.operaciones],
    areaNames: ['Operaciones'],
    isActive: true,
  },
];

/**
 * Determina las áreas que supervisa un usuario.
 */
export function getSupervisorAreas(sessionUser: SessionUser): string[] {
  if (sessionUser.role === 'ADMIN') {
    return [AREA_IDS.ventas, AREA_IDS.operaciones];
  }
  const match = DEFAULT_MANAGED_USERS.find((u) => u.id === sessionUser.id);
  if (match && match.areaIds.length > 0) {
    return match.areaIds;
  }
  const lowerName = sessionUser.name.toLowerCase();
  if (lowerName.includes('operaciones') || lowerName.includes('sofía') || lowerName.includes('sofia')) {
    return [AREA_IDS.operaciones];
  }
  return [AREA_IDS.ventas];
}

/**
 * Retorna únicamente los usuarios y roles a cargo del usuario en sesión.
 * - ADMIN: todo el personal de la organización bajo su dirección (excluyendo a sí misma o listando el equipo).
 * - SUPERVISOR: únicamente los empleados subordinados en su(s) área(s) a cargo.
 * - EMPLOYEE: ninguno (sin personal a cargo).
 */
export function getUsersUnderCharge(
  sessionUser: SessionUser,
  catalog: readonly ManagedUser[] = DEFAULT_MANAGED_USERS,
): ManagedUser[] {
  if (sessionUser.role === 'EMPLOYEE') {
    return [];
  }

  if (sessionUser.role === 'ADMIN') {
    // Para el administrador, todo el personal a cargo
    return catalog.filter((user) => user.id !== sessionUser.id);
  }

  // SUPERVISOR: personal de su área con rol subordinado (EMPLOYEE)
  const myAreas = getSupervisorAreas(sessionUser);
  return catalog.filter(
    (user) =>
      user.id !== sessionUser.id &&
      user.role === 'EMPLOYEE' &&
      user.areaIds.some((areaId) => myAreas.includes(areaId)),
  );
}
