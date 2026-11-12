import { describe, expect, test } from 'vitest';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { SessionUser } from '@/lib/session';
import {
  DEFAULT_MANAGED_USERS,
  getSupervisorAreas,
  getUsersUnderCharge,
} from '@/lib/users/managed-users';

describe('getUsersUnderCharge', () => {
  test('para ADMIN devuelve todo el personal a cargo de la organización (excluyendo a la admin misma)', () => {
    const admin: SessionUser = {
      id: FIXTURE_USERS.admin.id,
      name: 'Ana Administradora',
      role: 'ADMIN',
    };
    const managed = getUsersUnderCharge(admin);

    expect(managed).toHaveLength(4);
    expect(managed.map((u) => u.name)).toEqual([
      'Sergio Supervisor de Ventas',
      'Elena Empleada de Ventas',
      'Sofía Supervisora de Operaciones',
      'Emilio Empleado de Operaciones',
    ]);
  });

  test('para SUPERVISOR de Ventas devuelve únicamente a los empleados de Ventas a su cargo', () => {
    const supervisorVentas: SessionUser = {
      id: FIXTURE_USERS.supervisorVentas.id,
      name: 'Sergio Supervisor de Ventas',
      role: 'SUPERVISOR',
    };
    const managed = getUsersUnderCharge(supervisorVentas);

    expect(managed).toHaveLength(1);
    expect(managed[0].name).toBe('Elena Empleada de Ventas');
    expect(managed[0].role).toBe('EMPLOYEE');
    expect(managed[0].areaIds).toContain(AREA_IDS.ventas);
  });

  test('para SUPERVISOR de Operaciones devuelve únicamente a los empleados de Operaciones a su cargo', () => {
    const supervisorOperaciones: SessionUser = {
      id: FIXTURE_USERS.supervisorOperaciones.id,
      name: 'Sofía Supervisora de Operaciones',
      role: 'SUPERVISOR',
    };
    const managed = getUsersUnderCharge(supervisorOperaciones);

    expect(managed).toHaveLength(1);
    expect(managed[0].name).toBe('Emilio Empleado de Operaciones');
    expect(managed[0].role).toBe('EMPLOYEE');
    expect(managed[0].areaIds).toContain(AREA_IDS.operaciones);
  });

  test('para EMPLOYEE devuelve lista vacía porque no tiene personal a cargo', () => {
    const employee: SessionUser = {
      id: FIXTURE_USERS.empleadoVentas.id,
      name: 'Elena Empleada de Ventas',
      role: 'EMPLOYEE',
    };
    const managed = getUsersUnderCharge(employee);

    expect(managed).toEqual([]);
  });
});
