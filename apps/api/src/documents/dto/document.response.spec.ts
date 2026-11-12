//El archivo de pruebas para asegurar que el objeto de respuesta cumpla con la estructura esperada
import { ReferenceLookup } from '../document-references';
import type {
  DocumentRecord,
  VersionHistoryRecord,
} from '../documents.repository';
import {
  toDocumentResponse,
  toDocumentSearchResult,
  toDocumentSummary,
  toVersionHistoryItem,
} from './document.response';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const COMPRAS = '0a000000-0000-4000-8000-000000000003';
const OWNER = '0b000000-0000-4000-8000-000000000003';
const REVIEWER = '0b000000-0000-4000-8000-000000000001';
const MISSING_USER = '0b000000-0000-4000-8000-000000000099';

const record: DocumentRecord = {
  id: '0c000000-0000-4000-8000-000000000001',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [VENTAS],
  ownerId: OWNER,
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

// Spec 008: lo que devolvieron los directorios, armado a mano. Con más campos de los que puede mostrar
// la respuesta (R3): role y areaIds no tienen que llegar.
const refs = ReferenceLookup.from(
  [
    {
      id: OWNER,
      name: 'Elena Empleada',
      isActive: false,
      role: 'EMPLOYEE',
      areaIds: [VENTAS],
    } as { id: string; name: string; isActive: boolean },
    { id: REVIEWER, name: 'Ana Administradora', isActive: true },
  ],
  [
    { id: VENTAS, name: 'Ventas', isActive: true },
    { id: COMPRAS, name: 'Compras', isActive: false },
  ],
);

const OWNER_REF = { id: OWNER, name: 'Elena Empleada', isActive: false };
const VENTAS_REF = { id: VENTAS, name: 'Ventas', isActive: true };

// Un campo interno que alguien podría agregar más adelante al registro.
const recordWithExtra = {
  ...record,
  createdBy: { email: 'admin@empresa.com' },
  currentVersion: { ...record.currentVersion, bucket: 'privado' },
} as DocumentRecord;

describe('toDocumentResponse', () => {
  it('tiene exactamente la forma del JSON del plan 3.1, con las referencias de la spec 008', () => {
    expect(toDocumentResponse(record, refs)).toStrictEqual({
      id: record.id,
      title: 'Manual de caja',
      description: null,
      status: 'ACTIVE',
      areaIds: [VENTAS],
      areas: [VENTAS_REF],
      ownerId: record.ownerId,
      owner: OWNER_REF,
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
    const response = toDocumentResponse(
      { ...record, description: 'Caja' },
      refs,
    );

    expect(response.description).toBe('Caja');
  });

  it('no expone storageKey, checksum ni campos internos nuevos', () => {
    const json = JSON.stringify(toDocumentResponse(recordWithExtra, refs));

    expect(json).not.toMatch(/storageKey|checksum|documents\/|ba7816bf/);
    expect(json).not.toMatch(/createdBy"|email|bucket/);
  });

  it('no comparte el arreglo de áreas con el registro', () => {
    const response = toDocumentResponse(record, refs);

    expect(response.areaIds).not.toBe(record.areaIds);
  });

  // Spec 003, plan 1.6: el ADMIN ve desde cuándo está archivado.
  it('un documento archivado devuelve archivedAt como texto ISO', () => {
    const response = toDocumentResponse(
      {
        ...record,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-10-24T13:30:00.000Z'),
      },
      refs,
    );

    expect(response.status).toBe('ARCHIVED');
    expect(response.archivedAt).toBe('2026-10-24T13:30:00.000Z');
  });

  it('un registro sin archivedAt (activo) devuelve null', () => {
    expect(toDocumentResponse(record, refs).archivedAt).toBeNull();
    expect(
      toDocumentResponse({ ...record, archivedAt: null }, refs).archivedAt,
    ).toBeNull();
  });
});

// Spec 008 (R1, R3, R12; P1, P2; plan 1.2).
describe('referencias con nombre', () => {
  it('E1, E3: owner con nombre y estado, y ownerId sigue (P1)', () => {
    const response = toDocumentResponse(record, refs);

    expect(response.ownerId).toBe(OWNER);
    expect(response.owner).toStrictEqual(OWNER_REF);
  });

  it('E4: las áreas en el orden de areaIds, con la inactiva marcada', () => {
    const response = toDocumentSummary(
      { ...record, areaIds: [COMPRAS, VENTAS] },
      refs,
    );

    expect(response.areas).toStrictEqual([
      { id: COMPRAS, name: 'Compras', isActive: false },
      VENTAS_REF,
    ]);
  });

  it('R3: cada referencia tiene solo id, name e isActive', () => {
    const json = JSON.stringify(toDocumentResponse(record, refs));

    expect(json).not.toMatch(/"role"|EMPLOYEE/);
    expect(Object.keys(toDocumentResponse(record, refs).owner).sort()).toEqual([
      'id',
      'isActive',
      'name',
    ]);
  });

  it('E10: lo que no se encontró sale con name null (R12)', () => {
    const response = toDocumentResponse(
      { ...record, ownerId: MISSING_USER },
      refs,
    );

    expect(response.owner).toStrictEqual({
      id: MISSING_USER,
      name: null,
      isActive: false,
    });
  });

  it('el listado y la búsqueda llevan las mismas referencias que el detalle', () => {
    const { owner, areas } = toDocumentResponse(record, refs);

    expect(toDocumentSummary(record, refs)).toMatchObject({ owner, areas });
    expect(toDocumentSearchResult(record, null, refs)).toMatchObject({
      owner,
      areas,
    });
  });

  it('E7: cada versión del historial lleva uploadedBy, y uploadedById sigue (P3)', () => {
    const version: VersionHistoryRecord = {
      ...record.currentVersion,
      uploadedById: REVIEWER,
    };

    const item = toVersionHistoryItem(version, refs);

    expect(item.uploadedById).toBe(REVIEWER);
    expect(item.uploadedBy).toStrictEqual({
      id: REVIEWER,
      name: 'Ana Administradora',
      isActive: true,
    });
  });
});

describe('toDocumentSummary', () => {
  it('es igual al detalle, pero con la versión resumida', () => {
    const { currentVersion: _detail, ...documentFields } = toDocumentResponse(
      record,
      refs,
    );

    expect(toDocumentSummary(record, refs)).toStrictEqual({
      ...documentFields,
      currentVersion: {
        id: record.currentVersion.id,
        versionNumber: 1,
        originalFileName: 'manual.pdf',
        mimeType: 'application/pdf',
        processingStatus: 'PENDING',
        createdAt: record.currentVersion.createdAt.toISOString(),
      },
    });
  });

  it('no expone storageKey, checksum ni campos internos nuevos', () => {
    const json = JSON.stringify(toDocumentSummary(recordWithExtra, refs));

    expect(json).not.toMatch(/storageKey|checksum|documents\/|ba7816bf/);
    expect(json).not.toMatch(/createdBy"|email|bucket/);
  });

  it('también devuelve archivedAt', () => {
    const summary = toDocumentSummary(
      {
        ...record,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-10-24T13:30:00.000Z'),
      },
      refs,
    );

    expect(summary.archivedAt).toBe('2026-10-24T13:30:00.000Z');
  });
});

// Spec 005 (plan 2.1, D6): `review` solo si el servicio lo pasa (ADMIN o responsable).
describe('review en la respuesta', () => {
  const review = {
    status: 'OVERDUE' as const,
    lastReviewedAt: '2026-05-04T14:12:09.000Z',
    lastReviewedById: REVIEWER,
  };
  // Spec 008 (P2): con review, quien hizo la última revisión, con nombre.
  const expectedReview = {
    ...review,
    lastReviewedBy: {
      id: REVIEWER,
      name: 'Ana Administradora',
      isActive: true,
    },
  };
  const reviewedRecord: DocumentRecord = {
    ...record,
    lastReviewedAt: new Date('2026-05-04T14:12:09.000Z'),
    lastReviewedById: REVIEWER,
  };

  it('con review, el detalle, el listado y la búsqueda lo tienen, con lastReviewedBy (E5)', () => {
    expect(
      toDocumentResponse(reviewedRecord, refs, review).review,
    ).toStrictEqual(expectedReview);
    expect(
      toDocumentSummary(reviewedRecord, refs, review).review,
    ).toStrictEqual(expectedReview);
    expect(
      toDocumentSearchResult(reviewedRecord, null, refs, review).review,
    ).toStrictEqual(expectedReview);
  });

  it('nunca revisado: lastReviewedBy es null', () => {
    const response = toDocumentResponse(record, refs, {
      status: 'UP_TO_DATE',
      lastReviewedAt: null,
      lastReviewedById: null,
    });

    expect(response.review?.lastReviewedBy).toBeNull();
  });

  it('sin review, la clave no está y la última revisión del registro no sale por ningún lado', () => {
    for (const response of [
      toDocumentResponse(reviewedRecord, refs),
      toDocumentSummary(reviewedRecord, refs),
      toDocumentSearchResult(reviewedRecord, null, refs),
    ]) {
      expect(response).not.toHaveProperty('review');
      expect(JSON.stringify(response)).not.toMatch(
        /lastReviewed|2026-05-04T14:12:09|Ana Administradora/,
      );
    }
  });

  it('con review, los campos de la última revisión solo están dentro de review', () => {
    const response = toDocumentResponse(reviewedRecord, refs, review);

    expect(response).not.toHaveProperty('lastReviewedAt');
    expect(response).not.toHaveProperty('lastReviewedById');
    expect(response).not.toHaveProperty('lastReviewedBy');
  });
});
