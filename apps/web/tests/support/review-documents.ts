// A document of GET /documents/pending-review for the tests of "Vencen pronto" and "Vencidos".
import type { DocumentSummary, ReviewStatus } from '@/lib/api';

const ANA = '0b000000-0000-4000-8000-000000000001';
const NAMES: Record<string, string> = {
  '0a000000-0000-4000-8000-000000000001': 'Ventas',
  '0a000000-0000-4000-8000-000000000002': 'Operaciones',
};

export function reviewDocument(
  n: number,
  title: string,
  areaIds: string[],
  reviewDate: string,
  status: ReviewStatus,
): DocumentSummary {
  const id = String(n).padStart(12, '0');
  return {
    id: `1d000000-0000-4000-8000-${id}`,
    title,
    description: null,
    status: 'ACTIVE',
    areaIds,
    areas: areaIds.map((areaId) => ({ id: areaId, name: NAMES[areaId] ?? null, isActive: true })),
    ownerId: ANA,
    owner: { id: ANA, name: 'Ana Administradora', isActive: true },
    reviewDate,
    createdById: ANA,
    createdAt: '2026-01-10T12:00:00.000Z',
    currentVersion: {
      id: `1f000000-0000-4000-8000-${id}`,
      versionNumber: 1,
      originalFileName: 'manual.pdf',
      mimeType: 'application/pdf',
      processingStatus: 'READY',
    },
    review: { status, lastReviewedAt: null, lastReviewedById: null, lastReviewedBy: null },
  };
}
