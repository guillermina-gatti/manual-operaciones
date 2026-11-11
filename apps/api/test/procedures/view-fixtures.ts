/* Data and mocks that the specs of the service of reads share (spec 006, HU11) */
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import type { AreasDirectory } from '../../src/documents/ports/areas-directory';
import type { UsersDirectory } from '../../src/documents/ports/users-directory';
import type {
  ListedProcedure,
  ProcedureListRepository,
} from '../../src/procedures/procedure-list.repository';
import { ProcedureViewService } from '../../src/procedures/procedure-view.service';
import type {
  ProcedureRecord,
  ProceduresRepository,
  VersionRecord,
} from '../../src/procedures/procedures.repository';
import type { VersionsRepository } from '../../src/procedures/versions.repository';
import { SPEC_USERS } from '../executions/real-auth';

export const { ventas, operaciones } = AREA_IDS;
export const ID = '1a000000-0000-4000-8000-000000000001';
export const T0 = new Date('2026-11-01T10:00:00.000Z');
export const ADMIN = SPEC_USERS.admin;
export const EMPLOYEE = SPEC_USERS.empleadoVentas;
export const AREAS = [
  { id: ventas, name: 'Ventas', isActive: true },
  { id: operaciones, name: 'Operaciones', isActive: false },
];

export const version = (
  versionNumber: number,
  status: VersionRecord['status'],
  stepCount = 2,
): VersionRecord => ({
  id: `1b000000-0000-4000-8000-00000000000${versionNumber}`,
  procedureId: ID,
  versionNumber,
  status,
  title: `Cierre v${versionNumber}`,
  description: null,
  createdById: ADMIN.id,
  createdAt: T0,
  updatedAt: T0,
  stepCount,
});

export const procedure = (versions: VersionRecord[], areaIds: string[] = [ventas]): ProcedureRecord => ({
  id: ID,
  ownerId: ADMIN.id,
  createdAt: T0,
  updatedAt: T0,
  areaIds,
  versions,
});

export const listed = (id: string, areaIds: string[]): ListedProcedure => ({
  id,
  createdAt: T0,
  areaIds,
  hasOpenDraft: true,
  shown: { id: 'v', versionNumber: 2, status: 'PUBLISHED', title: 'Cierre', description: null, stepCount: 2 },
});

// The service with its five ports as mocks; the user directory knows Elena by default.
export function buildViewService() {
  const mocks = {
    list: { list: jest.fn() },
    procedures: { findById: jest.fn() },
    versions: { findVersion: jest.fn() },
    users: { findById: jest.fn().mockResolvedValue({ ...EMPLOYEE, isActive: true }) },
    areas: { findByIds: jest.fn().mockResolvedValue(AREAS) },
  };
  const service = new ProcedureViewService(
    mocks.list as unknown as ProcedureListRepository,
    mocks.procedures as unknown as ProceduresRepository,
    mocks.versions as unknown as VersionsRepository,
    mocks.users as unknown as UsersDirectory,
    mocks.areas as unknown as AreasDirectory,
  );
  return { service, ...mocks };
}
