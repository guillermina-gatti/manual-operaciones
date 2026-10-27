import type { ProcedureRecord, VersionRecord } from '../procedures.repository';
import { toProcedureResponse, toVersionResponse } from './procedure.response';

const T0 = new Date('2026-10-27T10:00:00.000Z');
const T1 = new Date('2026-10-27T11:30:00.000Z');

const version: VersionRecord = {
  id: '1b000000-0000-4000-8000-000000000001',
  procedureId: '1a000000-0000-4000-8000-000000000001',
  versionNumber: 2,
  status: 'DRAFT',
  title: 'Cierre de caja',
  description: null,
  createdById: '0b000000-0000-4000-8000-000000000001',
  createdAt: T0,
  updatedAt: T1,
  stepCount: 3,
};

const expectedVersion = {
  id: '1b000000-0000-4000-8000-000000000001',
  procedureId: '1a000000-0000-4000-8000-000000000001',
  versionNumber: 2,
  status: 'DRAFT',
  title: 'Cierre de caja',
  description: null,
  stepCount: 3,
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T11:30:00.000Z',
};

describe('toVersionResponse', () => {
  it('D10: maps field by field, without createdById, and the dates as ISO 8601 UTC', () => {
    expect(toVersionResponse(version)).toEqual(expectedVersion);
    expect(toVersionResponse(version)).not.toHaveProperty('createdById');
  });

  it('keeps a null description as null', () => {
    expect(toVersionResponse(version).description).toBeNull();
  });
});

describe('toProcedureResponse', () => {
  const procedure: ProcedureRecord = {
    id: '1a000000-0000-4000-8000-000000000001',
    ownerId: '0b000000-0000-4000-8000-000000000001',
    createdAt: T0,
    updatedAt: T1,
    areaIds: ['0a000000-0000-4000-8000-000000000001'],
    versions: [version],
  };

  it('D10: maps field by field, without ownerId, with its areas and versions', () => {
    const response = toProcedureResponse(procedure);

    expect(response).toEqual({
      id: '1a000000-0000-4000-8000-000000000001',
      areaIds: ['0a000000-0000-4000-8000-000000000001'],
      createdAt: '2026-10-27T10:00:00.000Z',
      updatedAt: '2026-10-27T11:30:00.000Z',
      versions: [expectedVersion],
    });
    expect(response).not.toHaveProperty('ownerId');
  });
});
