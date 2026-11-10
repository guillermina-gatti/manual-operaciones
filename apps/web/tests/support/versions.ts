// Test data for the versions screens (spec 015): the same ids as the API fixtures.
import type { VersionDetail, VersionHistoryItem } from '@/lib/api/procedure-versions';
import { ADMIN_ID, PROCEDURE_ID } from './procedures';

export const V1 = '1b000000-0000-4000-8000-000000000001';
export const V2 = '1b000000-0000-4000-8000-000000000002';
export const V3 = '1b000000-0000-4000-8000-000000000003';

// A version of the history; by default the draft 2.
export function versionItem(overrides: Partial<VersionHistoryItem> = {}): VersionHistoryItem {
  return {
    id: V2,
    procedureId: PROCEDURE_ID,
    versionNumber: 2,
    status: 'DRAFT',
    title: 'Cierre de caja',
    createdAt: '2026-11-05T12:00:00.000Z',
    publishedAt: null,
    publishedBy: null,
    isCritical: false,
    changeSummary: null,
    stepCount: 2,
    ...overrides,
  };
}

// A version published by the ADMIN on 10/11/2026 at 09:00 in Buenos Aires.
export const published = (overrides: Partial<VersionHistoryItem> = {}) =>
  versionItem({
    id: V1,
    versionNumber: 1,
    status: 'PUBLISHED',
    publishedAt: '2026-11-10T12:00:00.000Z',
    publishedBy: { id: ADMIN_ID, name: 'Ana Administradora' },
    ...overrides,
  });

export function versionDetail(overrides: Partial<VersionDetail> = {}): VersionDetail {
  return {
    ...published(),
    description: 'Al final del turno',
    steps: [
      { id: '1c000000-0000-4000-8000-000000000001', order: 1, title: 'Contar el efectivo', description: '' },
      { id: '1c000000-0000-4000-8000-000000000002', order: 2, title: 'Comparar con el sistema', description: 'Con el reporte' },
    ],
    ...overrides,
  };
}

export const page = (data: VersionHistoryItem[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
});
