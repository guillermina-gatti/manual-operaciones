/* Totales de las métricas de documentos contados en PostgreSQL (spec 007, R4 a R6; plan 4; T04) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { DocumentMetricsQuery } from '../../src/documents/metrics/document-metrics.repository';
import { PrismaDocumentMetricsRepository } from '../../src/documents/metrics/prisma-document-metrics.repository';
import { reviewStatusOf } from '../../src/documents/review-status';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument, setProcessingStatus } from './helpers';

const { ventas: VENTAS, operaciones: OPERACIONES } = AREA_IDS;

// "Hoy" es el 9/11 en Argentina (el reloj de la spec 005, D5 del plan 005): hoy + 30 = 9/12.
const ALL: DocumentMetricsQuery = {
  areaIds: null,
  today: '2026-11-09',
  dueSoonThrough: '2026-12-09',
  uploadedFrom: null,
  uploadedTo: null,
};
// 10/10 a 31/10, los dos inclusive, en hora de Argentina (toMetricsPeriod).
const OCTOBER = {
  uploadedFrom: new Date('2026-10-10T03:00:00.000Z'),
  uploadedTo: new Date('2026-11-01T03:00:00.000Z'),
};
const ZERO = {
  active: 0,
  upToDate: 0,
  dueSoon: 0,
  overdue: 0,
  processingFailed: 0,
  uploaded: 0,
};

describe('PrismaDocumentMetricsRepository (integración)', () => {
  let prisma: PrismaService;
  let repository: PrismaDocumentMetricsRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaDocumentMetricsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDocuments(prisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Un documento de Ventas al día, uno de Operaciones por vencer y uno de Ventas vencido.
  const seedE1 = async () => {
    await seedDocument(prisma, { areaIds: [VENTAS], reviewDate: '2027-02-07' });
    await seedDocument(prisma, {
      areaIds: [OPERACIONES],
      reviewDate: '2026-11-19',
    });
    await seedDocument(prisma, { areaIds: [VENTAS], reviewDate: '2026-11-04' });
  };

  it('E1: todas las áreas, con los tres estados de revisión', async () => {
    await seedE1();

    expect(await repository.totals(ALL)).toEqual({
      active: 3,
      upToDate: 1,
      dueSoon: 1,
      overdue: 1,
      processingFailed: 0,
      uploaded: 3,
    });
  });

  it('E2/E3: con áreas, cuenta solo los documentos que tienen alguna', async () => {
    await seedE1();

    expect(
      (await repository.totals({ ...ALL, areaIds: [VENTAS] })).active,
    ).toBe(2);
    expect(
      (await repository.totals({ ...ALL, areaIds: [OPERACIONES] })).active,
    ).toBe(1);
  });

  it('E6: un documento con dos áreas cuenta una sola vez', async () => {
    await seedDocument(prisma, {
      areaIds: [VENTAS, OPERACIONES],
      reviewDate: '2026-11-04',
    });

    expect(await repository.totals(ALL)).toMatchObject({
      active: 1,
      overdue: 1,
      uploaded: 1,
    });
    expect(
      await repository.totals({ ...ALL, areaIds: [VENTAS, OPERACIONES] }),
    ).toMatchObject({ active: 1, overdue: 1, uploaded: 1 });
    expect(
      (await repository.totals({ ...ALL, areaIds: [VENTAS] })).active,
    ).toBe(1);
  });

  it('un área que el documento no tiene no lo cuenta', async () => {
    await seedDocument(prisma, { areaIds: [VENTAS] });

    expect(await repository.totals({ ...ALL, areaIds: [OPERACIONES] })).toEqual(
      ZERO,
    );
  });

  it('E7: un archivado vencido, cargado en el período, no cuenta en nada', async () => {
    await seedDocument(prisma, {
      areaIds: [VENTAS],
      status: 'ARCHIVED',
      reviewDate: '2026-11-04',
      createdAt: new Date('2026-10-15T15:00:00.000Z'),
    });

    expect(await repository.totals(ALL)).toEqual(ZERO);
    expect(await repository.totals({ ...ALL, ...OCTOBER })).toEqual(ZERO);
  });

  it('E8: solo cuenta la versión vigente en error', async () => {
    const failed = await seedDocument(prisma, { areaIds: [VENTAS] });
    await setProcessingStatus(prisma, failed.versionId, 'FAILED');
    await seedDocument(prisma, {
      areaIds: [VENTAS],
      reviewDate: '2026-11-04',
    }); // PENDING: la versión todavía no se procesó
    const ready = await seedDocument(prisma, { areaIds: [VENTAS] });
    await setProcessingStatus(prisma, ready.versionId, 'READY');
    // Una versión reemplazada en error y la vigente lista.
    const replaced = await seedDocument(prisma, { areaIds: [VENTAS] });
    await prisma.documentVersion.update({
      where: { id: replaced.versionId },
      data: {
        status: 'REPLACED',
        processingStatus: 'FAILED',
        processingError: 'Error de prueba',
      },
    });
    const currentId = randomUUID();
    await prisma.documentVersion.create({
      data: {
        id: currentId,
        documentId: replaced.id,
        versionNumber: 2,
        storageKey: `documents/${replaced.id}/${currentId}.pdf`,
        originalFileName: 'documento.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksum: randomUUID().replace(/-/g, '').padEnd(64, '1'),
        processingStatus: 'READY',
        uploadedById: FIXTURE_USERS.admin.id,
      },
    });

    // El PENDING (vencido) cuenta en active y en overdue, no en processingFailed.
    expect(await repository.totals(ALL)).toEqual({
      active: 4,
      upToDate: 3,
      dueSoon: 0,
      overdue: 1,
      processingFailed: 1,
      uploaded: 4,
    });
  });

  it('E9: uploaded cuenta los cargados en el período, en hora de Argentina', async () => {
    const createdAts = [
      '2026-10-01T15:00:00.000Z', // 1/10: antes
      '2026-10-10T02:59:59.999Z', // 9/10 a las 23:59:59 en Argentina: antes
      '2026-10-10T03:00:00.000Z', // 10/10 a las 00:00 en Argentina: adentro
      '2026-10-15T15:00:00.000Z', // 15/10: adentro
      '2026-11-01T02:30:00.000Z', // 31/10 a las 23:30 en Argentina (1/11 en UTC): adentro
      '2026-11-01T03:00:00.000Z', // 1/11 a las 00:00 en Argentina: después
    ];
    for (const createdAt of createdAts) {
      await seedDocument(prisma, {
        areaIds: [VENTAS],
        createdAt: new Date(createdAt),
      });
    }

    expect(await repository.totals({ ...ALL, ...OCTOBER })).toMatchObject({
      active: 6,
      uploaded: 3,
    });
    expect((await repository.totals(ALL)).uploaded).toBe(6);
    expect(
      (
        await repository.totals({
          ...ALL,
          uploadedFrom: OCTOBER.uploadedFrom,
        })
      ).uploaded,
    ).toBe(4);
    expect(
      (await repository.totals({ ...ALL, uploadedTo: OCTOBER.uploadedTo }))
        .uploaded,
    ).toBe(5);
  });

  it('E11: sin documentos, o sin áreas, todo en 0', async () => {
    expect(await repository.totals(ALL)).toEqual(ZERO);

    await seedDocument(prisma, { areaIds: [VENTAS] });
    expect(await repository.totals({ ...ALL, areaIds: [] })).toEqual(ZERO);
  });

  it('D7: los tres estados coinciden con reviewStatusOf en cada borde', async () => {
    const reviewDates = [
      '2026-11-04', // vencido
      '2026-11-08', // ayer: último vencido
      '2026-11-09', // hoy: primer por vencer
      '2026-11-19',
      '2026-12-09', // hoy + 30: último por vencer
      '2026-12-10', // hoy + 31: primer al día
      '2027-02-07',
    ];
    for (const reviewDate of reviewDates) {
      await seedDocument(prisma, { areaIds: [VENTAS], reviewDate });
    }
    const count = (status: string) =>
      reviewDates.filter(
        (reviewDate) =>
          reviewStatusOf({ status: 'ACTIVE', reviewDate }, ALL.today) ===
          status,
      ).length;

    const totals = await repository.totals(ALL);

    expect(totals).toMatchObject({ overdue: 2, dueSoon: 3, upToDate: 2 });
    expect(totals).toMatchObject({
      overdue: count('OVERDUE'),
      dueSoon: count('DUE_SOON'),
      upToDate: count('UP_TO_DATE'),
    });
  });

  it('D9: una sola consulta', async () => {
    await seedE1();
    const queryRaw = jest.spyOn(prisma, '$queryRaw');

    await repository.totals({ ...ALL, areaIds: [VENTAS], ...OCTOBER });

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
