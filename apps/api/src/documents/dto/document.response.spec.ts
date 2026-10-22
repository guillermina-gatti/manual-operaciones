//El archivo de pruebas para asegurar que el objeto de respuesta cumpla con la estructura esperada
import type { DocumentRecord } from '../documents.repository';
import { toDocumentResponse, toDocumentSummary } from './document.response';

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
});
