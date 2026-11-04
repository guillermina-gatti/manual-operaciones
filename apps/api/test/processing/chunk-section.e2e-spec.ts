/* La columna section de chunks es opcional: los fragmentos sin título siguen válidos (HU18) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument } from '../documents/helpers';

describe('chunks.section (integración)', () => {
    let prisma: PrismaService;

    beforeAll(async () => {
        prisma = new PrismaService();
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await cleanDocuments(prisma);
    });

    it('acepta un fragmento sin section y lo devuelve como null', async () => {
        const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

        const chunk = await prisma.chunk.create({
            data: {
                id: randomUUID(),
                documentVersionId: seeded.versionId,
                documentId: seeded.id,
                chunkIndex: 0,
                content: 'Texto sin título.',
                areaIds: [AREA_IDS.ventas],
            },
        });

        expect(chunk.section).toBeNull();
    });

    it('guarda y devuelve el título de la sección', async () => {
        const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

        const chunk = await prisma.chunk.create({
            data: {
                id: randomUUID(),
                documentVersionId: seeded.versionId,
                documentId: seeded.id,
                chunkIndex: 0,
                content: 'Contar el efectivo.',
                section: 'Procedimiento de cierre',
                areaIds: [AREA_IDS.ventas],
            },
        });

        const stored = await prisma.chunk.findUniqueOrThrow({ where: { id: chunk.id } });
        expect(stored.section).toBe('Procedimiento de cierre');
    });
});