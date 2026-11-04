/* Spec 008 (T07): los nombres de las referencias en las respuestas, de punta a punta (R1 a R4, R12;
E1 a E8 y E10). Los usuarios salen de UsersDirectory a través de findUsersByIds (temporal, hasta
UsersDirectory.findByIds). */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  daysFromToday,
  deleteSeededDirectory,
  seedArea,
  seedDocument,
  seedProcessedVersion,
  seedUser,
  setAreaActive,
  setUserActive,
} from './helpers';

interface Reference {
  id: string;
  name: string | null;
  isActive: boolean;
}

interface DocumentBody {
  id: string;
  status: string;
  areaIds: string[];
  areas: Reference[];
  ownerId: string;
  owner: Reference;
  review?: {
    status: string | null;
    lastReviewedById: string | null;
    lastReviewedBy: Reference | null;
  };
}

interface VersionBody {
  versionNumber: number;
  uploadedById: string;
  uploadedBy: Reference;
}

const uniquePdf = () =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(randomUUID())]);

// R3: cada referencia de la respuesta tiene exactamente id, name e isActive.
const REFERENCE_KEYS = ['id', 'isActive', 'name'];
function referencesIn(body: unknown): Reference[] {
  const found: Reference[] = [];
  const visit = (value: unknown, key?: string) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
    } else if (value && typeof value === 'object') {
      if (
        key === 'owner' ||
        key === 'areas' ||
        key === 'lastReviewedBy' ||
        key === 'uploadedBy'
      ) {
        found.push(value as Reference);
        return;
      }
      for (const [child, item] of Object.entries(value)) visit(item, child);
    }
  };
  visit(body);
  return found;
}

const expectOnlyReferenceKeys = (body: unknown) => {
  const references = referencesIn(body);
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) {
    expect(Object.keys(reference).sort()).toEqual(REFERENCE_KEYS);
  }
};

describe('Referencias con nombre en las respuestas (integración, spec 008)', () => {
  let t: DocumentsTestApp;
  // Propios de la suite: Ana (EMPLOYEE de Ventas, responsable), Rita (ADMIN que revisa o sube
  // versiones) y Compras. Se reactivan antes de cada test; cada test desactiva lo que necesita.
  let ana: string;
  let rita: string;
  let compras: string;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const empleadoVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  const userName = async (id: string) =>
    (await t.prisma.user.findUniqueOrThrow({ where: { id } })).name;
  const areaName = async (id: string) =>
    (await t.prisma.area.findUniqueOrThrow({ where: { id } })).name;

  const listed = async (
    headers: { Authorization: string },
    id: string,
    path = '',
  ) => {
    const res = await http().get(`/api/documents${path}`).set(headers);
    expect(res.status).toBe(200);
    const body = res.body as { data: DocumentBody[] };
    const found = body.data.find((document) => document.id === id);
    expect(found).toBeDefined();
    return { body, document: found as DocumentBody };
  };

  beforeAll(async () => {
    t = await createDocumentsTestApp();
    compras = await seedArea(t.prisma, { name: 'Compras' });
    ana = await seedUser(t.prisma, {
      name: 'Ana Pérez',
      role: 'EMPLOYEE',
      areaIds: [AREA_IDS.ventas],
    });
    rita = await seedUser(t.prisma, {
      name: 'Rita Revisora',
      role: 'ADMIN',
      areaIds: [],
    });
  });

  afterAll(async () => {
    await cleanDocuments(t.prisma);
    await deleteSeededDirectory(t.prisma, {
      userIds: [ana, rita],
      areaIds: [compras],
    });
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    await setAreaActive(t.prisma, compras, true);
    for (const user of [ana, rita]) await setUserActive(t.prisma, user, true);
  });

  it('E1: el listado trae owner y areas con nombre y estado, y siguen ownerId y areaIds', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: ana,
    });

    const { body, document } = await listed(empleadoVentas, doc.id);

    expect(document.ownerId).toBe(ana);
    expect(document.owner).toStrictEqual({
      id: ana,
      name: 'Ana Pérez',
      isActive: true,
    });
    expect(document.areaIds).toEqual([AREA_IDS.ventas]);
    expect(document.areas).toStrictEqual([
      {
        id: AREA_IDS.ventas,
        name: await areaName(AREA_IDS.ventas),
        isActive: true,
      },
    ]);
    expectOnlyReferenceKeys(body);
  });

  it('E2: la búsqueda, con el responsable desactivado → owner.isActive false', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: ana,
      title: 'Manual de caja',
    });
    await seedProcessedVersion(t.prisma, {
      documentId: doc.id,
      versionId: doc.versionId,
      areaIds: [AREA_IDS.ventas],
      contents: ['Cómo cerrar la caja al final del día'],
    });
    await setUserActive(t.prisma, ana, false);

    const res = await http()
      .get('/api/documents/search')
      .query({ q: 'caja' })
      .set(admin);

    expect(res.status).toBe(200);
    const body = res.body as { data: DocumentBody[] };
    const found = body.data.find((document) => document.id === doc.id);
    expect(found?.owner).toStrictEqual({
      id: ana,
      name: 'Ana Pérez',
      isActive: false,
    });
    expectOnlyReferenceKeys(body);
  });

  it('E3: el detalle, con el responsable desactivado → owner.isActive false', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: ana,
    });
    await setUserActive(t.prisma, ana, false);

    const res = await http().get(`/api/documents/${doc.id}`).set(admin);

    expect(res.status).toBe(200);
    expect((res.body as DocumentBody).owner).toStrictEqual({
      id: ana,
      name: 'Ana Pérez',
      isActive: false,
    });
    expectOnlyReferenceKeys(res.body);
  });

  it('E4: con Compras inactiva, areas en el orden de areaIds y Compras marcada', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas, compras],
    });
    await setAreaActive(t.prisma, compras, false);

    const res = await http().get(`/api/documents/${doc.id}`).set(admin);
    const body = res.body as DocumentBody;

    expect(body.areas.map((area) => area.id)).toEqual(body.areaIds);
    const comprasRef = body.areas.find((area) => area.id === compras);
    expect(comprasRef).toStrictEqual({
      id: compras,
      name: await areaName(compras),
      isActive: false,
    });
    expect(
      body.areas.find((area) => area.id === AREA_IDS.ventas)?.isActive,
    ).toBe(true);
  });

  it('E5: revisado por un ADMIN que después se desactiva → el responsable lo ve inactivo; otro de Ventas no recibe review', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: ana,
      lastReview: { at: new Date('2026-10-20T15:00:00.000Z'), byId: rita },
    });
    await setUserActive(t.prisma, rita, false);
    const asAna = authHeaders({ id: ana, role: 'EMPLOYEE' });

    const owner = await http().get(`/api/documents/${doc.id}`).set(asAna);
    const other = await http()
      .get(`/api/documents/${doc.id}`)
      .set(empleadoVentas);

    expect(owner.status).toBe(200);
    expect((owner.body as DocumentBody).review?.lastReviewedBy).toStrictEqual({
      id: rita,
      name: 'Rita Revisora',
      isActive: false,
    });
    expect(other.status).toBe(200);
    expect(other.body).not.toHaveProperty('review');
    expect(JSON.stringify(other.body)).not.toContain('Rita Revisora');
  });

  it('E6: "Por revisar" del ADMIN, con el responsable desactivado → owner.isActive false', async () => {
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: ana,
      reviewDate: daysFromToday(10),
    });
    await setUserActive(t.prisma, ana, false);

    const { body, document } = await listed(admin, doc.id, '/pending-review');

    expect(document.owner).toStrictEqual({
      id: ana,
      name: 'Ana Pérez',
      isActive: false,
    });
    expectOnlyReferenceKeys(body);
  });

  it('E7: el historial trae uploadedBy en cada versión, con la primera de un ADMIN desactivado', async () => {
    const doc = await seedDocument(t.prisma, { areaIds: [AREA_IDS.ventas] });
    await t.prisma.documentVersion.update({
      where: { id: doc.versionId },
      data: { uploadedById: rita },
    });
    const upload = await http()
      .post(`/api/documents/${doc.id}/versions`)
      .set(admin)
      .attach('file', uniquePdf(), {
        filename: 'documento v2.pdf',
        contentType: 'application/pdf',
      });
    expect(upload.status).toBe(201);
    await setUserActive(t.prisma, rita, false);

    const res = await http()
      .get(`/api/documents/${doc.id}/versions`)
      .set(admin);

    expect(res.status).toBe(200);
    const versions = (res.body as { data: VersionBody[] }).data;
    expect(versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(versions[0].uploadedById).toBe(FIXTURE_USERS.admin.id);
    expect(versions[0].uploadedBy).toStrictEqual({
      id: FIXTURE_USERS.admin.id,
      name: await userName(FIXTURE_USERS.admin.id),
      isActive: true,
    });
    expect(versions[1].uploadedById).toBe(rita);
    expect(versions[1].uploadedBy).toStrictEqual({
      id: rita,
      name: 'Rita Revisora',
      isActive: false,
    });
    expectOnlyReferenceKeys(res.body);
  });

  describe('E8: las escrituras responden owner y areas', () => {
    const ventasRef = async () => ({
      id: AREA_IDS.ventas,
      name: await areaName(AREA_IDS.ventas),
      isActive: true,
    });

    it('carga', async () => {
      const res = await http()
        .post('/api/documents')
        .set(admin)
        .field('title', 'Manual de caja')
        .field('areaIds', AREA_IDS.ventas)
        .field('ownerId', ana)
        .field('reviewDate', daysFromToday(30))
        .attach('file', uniquePdf(), {
          filename: 'manual.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      const body = res.body as DocumentBody;
      expect(body.owner).toStrictEqual({
        id: ana,
        name: 'Ana Pérez',
        isActive: true,
      });
      expect(body.areas).toStrictEqual([await ventasRef()]);
      expectOnlyReferenceKeys(body);
    });

    it('cambio de áreas, con un área inactiva que ya tenía', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas, compras],
        ownerId: ana,
      });
      await setAreaActive(t.prisma, compras, false);

      const res = await http()
        .patch(`/api/documents/${doc.id}/areas`)
        .set(admin)
        // Ana es de Ventas: Ventas se queda para que no pierda el acceso (E16).
        .send({ areaIds: [AREA_IDS.ventas, compras, AREA_IDS.operaciones] });

      expect(res.status).toBe(200);
      const body = res.body as DocumentBody;
      expect(body.owner.name).toBe('Ana Pérez');
      expect(body.areas.map((area) => area.id)).toEqual(body.areaIds);
      expect(body.areas).toEqual(
        expect.arrayContaining([
          await ventasRef(),
          { id: compras, name: await areaName(compras), isActive: false },
          {
            id: AREA_IDS.operaciones,
            name: await areaName(AREA_IDS.operaciones),
            isActive: true,
          },
        ]),
      );
      expect(body.areas).toHaveLength(3);
    });

    it('versión nueva', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: ana,
      });

      const res = await http()
        .post(`/api/documents/${doc.id}/versions`)
        .set(admin)
        .attach('file', uniquePdf(), {
          filename: 'manual v2.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      const body = res.body as DocumentBody;
      expect(body.owner.name).toBe('Ana Pérez');
      expect(body.areas).toStrictEqual([await ventasRef()]);
    });

    it('"Marcar como revisado" responde lastReviewedBy del ADMIN', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: ana,
        reviewDate: daysFromToday(5),
      });

      const res = await http()
        .post(`/api/documents/${doc.id}/review`)
        .set(admin)
        .send({ reviewDate: daysFromToday(90) });

      expect(res.status).toBe(200);
      const body = res.body as DocumentBody;
      expect(body.owner.name).toBe('Ana Pérez');
      expect(body.areas).toStrictEqual([await ventasRef()]);
      expect(body.review?.lastReviewedById).toBe(FIXTURE_USERS.admin.id);
      expect(body.review?.lastReviewedBy).toStrictEqual({
        id: FIXTURE_USERS.admin.id,
        name: await userName(FIXTURE_USERS.admin.id),
        isActive: true,
      });
      expectOnlyReferenceKeys(body);
    });

    it('archivar', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: ana,
      });

      const res = await http()
        .post(`/api/documents/${doc.id}/archive`)
        .set(admin);

      expect(res.status).toBe(200);
      const body = res.body as DocumentBody;
      expect(body.status).toBe('ARCHIVED');
      expect(body.owner.name).toBe('Ana Pérez');
      expect(body.areas).toStrictEqual([await ventasRef()]);
    });
  });

  it('E10: un ownerId que no corresponde a ningún usuario → owner con name null e isActive false', async () => {
    const missing = randomUUID();
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: missing,
    });

    const res = await http().get(`/api/documents/${doc.id}`).set(admin);

    expect(res.status).toBe(200);
    expect((res.body as DocumentBody).owner).toStrictEqual({
      id: missing,
      name: null,
      isActive: false,
    });
  });
});
