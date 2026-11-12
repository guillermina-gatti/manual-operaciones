// Lee los documentos vigentes con sus áreas y los agrupa por área activa. Solo lectura.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CatalogGroup } from '../chat-catalog';
import { ChatDocumentsCatalog } from '../ports/chat-documents-catalog';

@Injectable()
export class PrismaChatDocumentsCatalog extends ChatDocumentsCatalog {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async listByArea(areaIds: string[] | null): Promise<CatalogGroup[]> {
        const documents = await this.prisma.document.findMany({
            where: {
                status: 'ACTIVE',
                versions: { some: { status: 'CURRENT' } },
                ...(areaIds && { areas: { some: { areaId: { in: areaIds } } } }),
            },
            select: { title: true, areas: { select: { areaId: true } } },
            orderBy: { title: 'asc' },
        });

        // Solo las áreas del alcance del usuario que tienen documentos, y solo las activas.
        const candidateIds = [...new Set(documents.flatMap((doc) => doc.areas.map((a) => a.areaId)))].filter(
            (id) => areaIds === null || areaIds.includes(id),
        );
        if (candidateIds.length === 0) return [];

        const areas = await this.prisma.area.findMany({
            where: { id: { in: candidateIds }, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        return areas.map((area) => ({
            areaName: area.name,
            titles: documents
                .filter((doc) => doc.areas.some((a) => a.areaId === area.id))
                .map((doc) => doc.title),
        }));
    }
}