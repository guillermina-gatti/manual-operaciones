/* Data that the specs of the versions share (spec 015) */
import type {
  VersionDetailRecord,
  VersionHistoryRecord,
} from '../../src/procedures/versions.repository';
import { SPEC_USERS } from '../executions/real-auth';

export const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
export const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
export const NOW = new Date('2026-11-10T12:00:00.000Z');

// A PUBLISHED version published by the ADMIN of the specs.
export const record = (overrides: Partial<VersionHistoryRecord> = {}): VersionHistoryRecord => ({
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  versionNumber: 2,
  status: 'PUBLISHED',
  title: 'Cierre de caja',
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  publishedAt: NOW,
  publishedById: SPEC_USERS.admin.id,
  isCritical: false,
  changeSummary: null,
  stepCount: 2,
  ...overrides,
});

export const detail = (overrides: Partial<VersionDetailRecord> = {}): VersionDetailRecord => ({
  ...record(),
  description: null,
  steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }],
  ...overrides,
});
