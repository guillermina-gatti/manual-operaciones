//El archivo de pruebas para asegurar que el objeto de respuesta cumpla con la estructura esperada
import type { DocumentRecord } from '../documents.repository';
import {
  toDocumentResponse,
  toDocumentSearchResult,
  toDocumentSummary,
} from './document.response';

const record: DocumentRecord = {
  id: '0c000000-0000-4000-8000-000000000001',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: ['0a000000-0000-4000-8000-000000000001'],
  ownerId: '0b000000-0000-4000-8000-000000000003',
  // Prisma devuelve las columnas @db.Date como medianoche UTC.
  reviewDate: new Date('2027-03-01T00:00:00.000Z'),
  createdById: '0b000000-0000-4000-8000-000000000001',
  createdAt: new Date('2026-10-22T12:00:00.000Z'),
  currentVersion: {
    id: '0d000000-0000-4000-8000-000000000001',
    versionNumber: 1,
    status: 'CURRENT',
    storageKey:
      'documents/0c000000-0000-4000-8000-000000000001/0d000000-0000-4000-8000-000000000001.pdf',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2097152,
    checksum:
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    processingStatus: 'PENDING',
    createdAt: new Date('2026-10-22T12:00:00.000Z'),
  },
};

// Un campo interno que alguien podría agregar más adelante al registro.
const recordWithExtra = {
  ...record,
  createdBy: { email: 'admin@empresa.com' },
  currentVersion: { ...record.currentVersion, bucket: 'privado' },
} as DocumentRecord;

describe('toDocumentResponse', () => {
  it('tiene exactamente la forma del JSON del plan 3.1', () => {
    expect(toDocumentResponse(record)).toStrictEqual({
      id: record.id,
      title: 'Manual de caja',
      description: null,
      status: 'ACTIVE',
      areaIds: ['0a000000-0000-4000-8000-000000000001'],
      ownerId: record.ownerId,
      reviewDate: '2027-03-01',
      createdById: record.createdById,
      createdAt: '2026-10-22T12:00:00.000Z',
      archivedAt: null,
      currentVersion: {
        id: record.currentVersion.id,
        versionNumber: 1,
        status: 'CURRENT',
        originalFileName: 'manual.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2097152,
        processingStatus: 'PENDING',
        createdAt: '2026-10-22T12:00:00.000Z',
      },
    });
  });

  it('devuelve la descripción cuando hay', () => {
    const response = toDocumentResponse({ ...record, description: 'Caja' });

    expect(response.description).toBe('Caja');
  });

  it('no expone storageKey, checksum ni campos internos nuevos', () => {
    const json = JSON.stringify(toDocumentResponse(recordWithExtra));

    expect(json).not.toMatch(/storageKey|checksum|documents\/|ba7816bf/);
    expect(json).not.toMatch(/createdBy"|email|bucket/);
  });

  it('no comparte el arreglo de áreas con el registro', () => {
    const response = toDocumentResponse(record);

    expect(response.areaIds).not.toBe(record.areaIds);
  });

  // Spec 003, plan 1.6: el ADMIN ve desde cuándo está archivado.
  it('un documento archivado devuelve archivedAt como texto ISO', () => {
    const response = toDocumentResponse({
      ...record,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-24T13:30:00.000Z'),
    });

    expect(response.status).toBe('ARCHIVED');
    expect(response.archivedAt).toBe('2026-10-24T13:30:00.000Z');
  });

  it('un registro sin archivedAt (activo) devuelve null', () => {
    expect(toDocumentResponse(record).archivedAt).toBeNull();
    expect(
      toDocumentResponse({ ...record, archivedAt: null }).archivedAt,
    ).toBeNull();
  });
});

describe('toDocumentSummary', () => {
  it('es igual al detalle, pero con la versión resumida', () => {
    const { currentVersion: _detail, ...documentFields } =
      toDocumentResponse(record);

    expect(toDocumentSummary(record)).toStrictEqual({
      ...documentFields,
      currentVersion: {
        id: record.currentVersion.id,
        versionNumber: 1,
        originalFileName: 'manual.pdf',
        mimeType: 'application/pdf',
        processingStatus: 'PENDING',
      },
    });
  });

  it('no expone storageKey, checksum ni campos internos nuevos', () => {
    const json = JSON.stringify(toDocumentSummary(recordWithExtra));

    expect(json).not.toMatch(/storageKey|checksum|documents\/|ba7816bf/);
    expect(json).not.toMatch(/createdBy"|email|bucket/);
  });

  it('también devuelve archivedAt', () => {
    const summary = toDocumentSummary({
      ...record,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-24T13:30:00.000Z'),
    });

    expect(summary.archivedAt).toBe('2026-10-24T13:30:00.000Z');
  });
});

// Spec 005 (plan 2.1, D6): `review` solo si el servicio lo pasa (ADMIN o responsable).
describe('review en la respuesta', () => {
  const review = {
    status: 'OVERDUE' as const,
    lastReviewedAt: '2026-05-04T14:12:09.000Z',
    lastReviewedById: '0b000000-0000-4000-8000-000000000003',
  };
  const reviewedRecord: DocumentRecord = {
    ...record,
    lastReviewedAt: new Date('2026-05-04T14:12:09.000Z'),
    lastReviewedById: '0b000000-0000-4000-8000-000000000003',
  };

  it('con review, el detalle, el listado y la búsqueda lo tienen, con sus tres campos', () => {
    expect(toDocumentResponse(reviewedRecord, review).review).toStrictEqual(
      review,
    );
    expect(toDocumentSummary(reviewedRecord, review).review).toStrictEqual(
      review,
    );
    expect(
      toDocumentSearchResult(reviewedRecord, null, review).review,
    ).toStrictEqual(review);
  });

  it('sin review, la clave no está y la última revisión del registro no sale por ningún lado', () => {
    for (const response of [
      toDocumentResponse(reviewedRecord),
      toDocumentSummary(reviewedRecord),
      toDocumentSearchResult(reviewedRecord, null),
    ]) {
      expect(response).not.toHaveProperty('review');
      expect(JSON.stringify(response)).not.toMatch(
        /lastReviewed|2026-05-04T14:12:09/,
      );
    }
  });

  it('con review, los campos de la última revisión solo están dentro de review', () => {
    const response = toDocumentResponse(reviewedRecord, review);

    expect(response).not.toHaveProperty('lastReviewedAt');
    expect(response).not.toHaveProperty('lastReviewedById');
  });
});
