/* Spec 008 (T03): asignaciones con usuarios y áreas inactivos, de punta a punta (R5 a R11, E11 a E18 y E22) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { AuditEntry } from '../../src/documents/ports/audit-log';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  daysFromToday,
  deleteSeededDirectory,
  seedArea,
  seedDocument,
  seedUser,
  setAreaActive,
  setUserActive,
} from './helpers';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

interface DocumentBody {
  id: string;
  areaIds: string[];
  ownerId: string;
}

const messages = (body: ErrorBody) => ([] as string[]).concat(body.message);

// Un PDF distinto en cada llamada, para que nunca choque con el duplicado (R8b de la spec 001).
const uniquePdf = () =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(randomUUID())]);

describe('Asignaciones con usuarios y áreas inactivos (integración, spec 008)', () => {
  let t: DocumentsTestApp;
  // Compras y Logística: áreas propias de esta suite. Ana: EMPLOYEE de Ventas; Bruno: EMPLOYEE de
  // Compras. Se reactivan antes de cada test; cada test desactiva lo que necesita.
  let compras: string;
  let logistica: string;
  let ana: string;
  let bruno: string;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const http = () => request(t.app.getHttpServer());

  const documentAreas = async (documentId: string) =>
    (
      await t.prisma.documentArea.findMany({
        where: { documentId },
        select: { areaId: true },
      })
    )
      .map((row) => row.areaId)
      .sort();

  const upload = (fields: { areaIds: string[]; ownerId: string }) => {
    let req = http()
      .post('/api/documents')
      .set(admin)
      .field('title', 'Manual de compras')
      .field('ownerId', fields.ownerId)
      .field('reviewDate', daysFromToday(30));
    for (const areaId of fields.areaIds) req = req.field('areaIds', areaId);
    return req.attach('file', uniquePdf(), {
      filename: 'manual.pdf',
      contentType: 'application/pdf',
    });
  };

  const changeAreas = (
    documentId: string,
    body: { areaIds: string[]; ownerId?: string },
  ) => http().patch(`/api/documents/${documentId}/areas`).set(admin).send(body);

  beforeAll(async () => {
    t = await createDocumentsTestApp();
    compras = await seedArea(t.prisma, { name: 'Compras' });
    logistica = await seedArea(t.prisma, { name: 'Logística' });
    ana = await seedUser(t.prisma, {
      name: 'Ana Pérez',
      role: 'EMPLOYEE',
      areaIds: [AREA_IDS.ventas],
    });
    bruno = await seedUser(t.prisma, {
      name: 'Bruno Gómez',
      role: 'EMPLOYEE',
      areaIds: [compras],
    });
  });

  afterAll(async () => {
    await cleanDocuments(t.prisma);
    await deleteSeededDirectory(t.prisma, {
      userIds: [ana, bruno],
      areaIds: [compras, logistica],
    });
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    for (const area of [compras, logistica]) {
      await setAreaActive(t.prisma, area, true);
    }
    for (const user of [ana, bruno]) await setUserActive(t.prisma, user, true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('carga', () => {
    it('E11: con un responsable inactivo → 400 y no se guarda nada', async () => {
      await setUserActive(t.prisma, ana, false);
      const put = jest.spyOn(t.storage, 'put');

      const res = await upload({ areaIds: [AREA_IDS.ventas], ownerId: ana });

      expect(res.status).toBe(400);
      expect(messages(res.body as ErrorBody)).toContain(
        'ownerId: el responsable está inactivo',
      );
      expect(await t.prisma.document.count()).toBe(0);
      expect(put).not.toHaveBeenCalled();
    });

    it('E12: con un área inactiva → 400 que la nombra y no se guarda nada', async () => {
      await setAreaActive(t.prisma, compras, false);
      const put = jest.spyOn(t.storage, 'put');

      const res = await upload({
        areaIds: [AREA_IDS.ventas, compras],
        ownerId: FIXTURE_USERS.supervisorVentas.id,
      });

      expect(res.status).toBe(400);
      expect(messages(res.body as ErrorBody)).toContain(
        `areaIds: están inactivas las áreas ${compras}`,
      );
      expect(await t.prisma.document.count()).toBe(0);
      expect(put).not.toHaveBeenCalled();
    });

    it('con responsable y áreas activos, la carga sigue funcionando', async () => {
      const res = await upload({
        areaIds: [AREA_IDS.ventas, compras],
        ownerId: ana,
      });

      expect(res.status).toBe(201);
    });
  });

  describe('cambio de áreas', () => {
    it('E13: conserva un área inactiva que el documento ya tiene', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas, compras],
      });
      await setAreaActive(t.prisma, compras, false);

      const res = await changeAreas(doc.id, {
        areaIds: [compras, AREA_IDS.operaciones],
      });

      expect(res.status).toBe(200);
      expect(await documentAreas(doc.id)).toEqual(
        [compras, AREA_IDS.operaciones].sort(),
      );
    });

    it('E14: agregar un área inactiva → 400 y las áreas no cambian', async () => {
      const doc = await seedDocument(t.prisma, { areaIds: [AREA_IDS.ventas] });
      await setAreaActive(t.prisma, logistica, false);

      const res = await changeAreas(doc.id, {
        areaIds: [AREA_IDS.ventas, logistica],
      });

      expect(res.status).toBe(400);
      expect(messages(res.body as ErrorBody)).toContain(
        `areaIds: están inactivas las áreas ${logistica}`,
      );
      expect(await documentAreas(doc.id)).toEqual([AREA_IDS.ventas]);
    });

    it('E15: sin ownerId, el responsable inactivo que sigue teniendo acceso se conserva', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
        ownerId: ana,
      });
      await setUserActive(t.prisma, ana, false);

      const res = await changeAreas(doc.id, { areaIds: [AREA_IDS.ventas] });

      expect(res.status).toBe(200);
      expect((res.body as DocumentBody).ownerId).toBe(ana);
    });

    it('E16: sin ownerId, el responsable inactivo que pierde el acceso → 400 de acceso', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: ana,
      });
      await setUserActive(t.prisma, ana, false);

      const res = await changeAreas(doc.id, {
        areaIds: [AREA_IDS.operaciones],
      });

      expect(res.status).toBe(400);
      expect(messages(res.body as ErrorBody)).toContain(
        'ownerId: el responsable no comparte ningún área con el documento',
      );
      expect(await documentAreas(doc.id)).toEqual([AREA_IDS.ventas]);
    });

    it('E17: un ownerId nuevo inactivo → 400 y el responsable no cambia', async () => {
      const doc = await seedDocument(t.prisma, { areaIds: [AREA_IDS.ventas] });
      await setUserActive(t.prisma, ana, false);

      const res = await changeAreas(doc.id, {
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
        ownerId: ana,
      });

      expect(res.status).toBe(400);
      expect(messages(res.body as ErrorBody)).toContain(
        'ownerId: el responsable está inactivo',
      );
      const stored = await t.prisma.document.findUniqueOrThrow({
        where: { id: doc.id },
      });
      expect(stored.ownerId).toBe(FIXTURE_USERS.admin.id);
    });

    it('el mismo ownerId que el actual, inactivo, no es un cambio de responsable (R6)', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: ana,
      });
      await setUserActive(t.prisma, ana, false);

      const res = await changeAreas(doc.id, {
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
        ownerId: ana,
      });

      expect(res.status).toBe(200);
    });

    it('los 400 nuevos quedan en la auditoría como fallo', async () => {
      const doc = await seedDocument(t.prisma, { areaIds: [AREA_IDS.ventas] });
      await setAreaActive(t.prisma, logistica, false);
      const record = jest.spyOn(t.audit, 'record');

      await changeAreas(doc.id, { areaIds: [logistica] });

      const entries = record.mock.calls.map(([entry]) => entry as AuditEntry);
      expect(entries).toContainEqual(
        expect.objectContaining({
          action: 'DOCUMENT_AREAS_CHANGE',
          documentId: doc.id,
          result: 'FAILURE',
          detail: '400',
        }),
      );
    });
  });

  it('E18: desactivar al responsable y a un área no cambia el documento', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas, compras],
      ownerId: ana,
    });

    await setUserActive(t.prisma, ana, false);
    await setAreaActive(t.prisma, compras, false);

    const stored = await t.prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect(stored.ownerId).toBe(ana);
    expect(await documentAreas(doc.id)).toEqual(
      [AREA_IDS.ventas, compras].sort(),
    );
  });

  it('E22: un EMPLOYEE de un área inactiva sigue viendo sus documentos (la visibilidad no cambia)', async () => {
    const doc = await seedDocument(t.prisma, { areaIds: [compras] });
    await setAreaActive(t.prisma, compras, false);
    const asBruno = authHeaders({ id: bruno, role: 'EMPLOYEE' });

    const list = await http().get('/api/documents').set(asBruno);
    const detail = await http().get(`/api/documents/${doc.id}`).set(asBruno);

    expect(list.status).toBe(200);
    expect(
      (list.body as { data: DocumentBody[] }).data.map((d) => d.id),
    ).toEqual([doc.id]);
    expect(detail.status).toBe(200);
  });
});
