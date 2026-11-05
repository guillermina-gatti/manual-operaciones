/* Las alertas de contradicción en PostgreSQL (spec 011, R14, R15; plan 011, 2.7). Tres consultas por
página: las alertas con sus documentos y versiones, las secciones de sus fragmentos (chunks es de
Guille: solo lectura y por ID, D16) y los dos totales */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositoryUnavailableError } from '../documents.repository';
import { isUnavailable } from '../prisma-documents.repository';
import {
  ConflictAlertPage,
  ConflictAlertRecord,
  ConflictAlertSide,
  ConflictAlertsRepository,
  ListConflictAlertsFilter,
} from './conflict-alerts.repository';

const INCLUDE = {
  documentA: { select: { title: true, status: true } },
  documentB: { select: { title: true, status: true } },
  versionA: { select: { versionNumber: true, status: true } },
  versionB: { select: { versionNumber: true, status: true } },
} as const;

interface AlertRow {
  id: string;
  status: 'OPEN' | 'RESOLVED';
  documentAId: string;
  documentBId: string;
  chunkAId: string;
  chunkBId: string;
  question: string;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  occurrences: number;
  resolvedAt: Date | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  documentA: { title: string; status: 'ACTIVE' | 'ARCHIVED' };
  documentB: { title: string; status: 'ACTIVE' | 'ARCHIVED' };
  versionA: { versionNumber: number; status: 'CURRENT' | 'REPLACED' };
  versionB: { versionNumber: number; status: 'CURRENT' | 'REPLACED' };
}

@Injectable()
export class PrismaConflictAlertsRepository extends ConflictAlertsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list({
    status,
    page,
    limit,
  }: ListConflictAlertsFilter): Promise<ConflictAlertPage> {
    return this.translate(async () => {
      // R14: las abiertas por la última detección; las resueltas, por cuándo se resolvieron.
      const orderBy =
        status === 'OPEN'
          ? [{ lastDetectedAt: 'desc' as const }, { id: 'asc' as const }]
          : [{ resolvedAt: 'desc' as const }, { id: 'asc' as const }];
      const [rows, total, openTotal] = await this.prisma.$transaction([
        this.prisma.documentConflictAlert.findMany({
          where: { status },
          include: INCLUDE,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.documentConflictAlert.count({ where: { status } }),
        this.prisma.documentConflictAlert.count({ where: { status: 'OPEN' } }),
      ]);
      const sections = await this.sectionsOf(rows);
      return {
        items: rows.map((row) => toRecord(row, sections)),
        total,
        openTotal,
      };
    });
  }

  findById(id: string): Promise<ConflictAlertRecord | null> {
    return this.translate(async () => {
      const row = await this.prisma.documentConflictAlert.findUnique({
        where: { id },
        include: INCLUDE,
      });
      if (!row) return null;
      return toRecord(row, await this.sectionsOf([row]));
    });
  }

  resolve(
    id: string,
    resolvedById: string,
    note: string | null,
    at: Date,
  ): Promise<boolean> {
    return this.translate(async () => {
      // Solo si sigue abierta: dos ADMIN a la vez, uno gana y el otro recibe 409 (R15).
      const { count } = await this.prisma.documentConflictAlert.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolvedAt: at,
          resolvedById,
          resolutionNote: note,
        },
      });
      return count === 1;
    });
  }

  // La sección de cada fragmento, por ID. Un fragmento que ya no existe no aparece.
  private async sectionsOf(
    rows: Pick<AlertRow, 'chunkAId' | 'chunkBId'>[],
  ): Promise<Map<string, string | null>> {
    const ids = [...new Set(rows.flatMap((r) => [r.chunkAId, r.chunkBId]))];
    if (ids.length === 0) return new Map();
    const chunks = await this.prisma.chunk.findMany({
      where: { id: { in: ids } },
      select: { id: true, section: true },
    });
    return new Map(chunks.map((c) => [c.id, c.section]));
  }

  private async translate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUnavailable(error)) {
        throw new RepositoryUnavailableError('La base de datos no responde', {
          cause: error,
        });
      }
      throw error;
    }
  }
}

function toRecord(
  row: AlertRow,
  sections: Map<string, string | null>,
): ConflictAlertRecord {
  const side = (
    documentId: string,
    document: AlertRow['documentA'],
    version: AlertRow['versionA'],
    chunkId: string,
  ): ConflictAlertSide => ({
    documentId,
    title: document.title,
    documentStatus: document.status,
    versionNumber: version.versionNumber,
    isCurrentVersion: version.status === 'CURRENT',
    section: sections.get(chunkId) ?? null,
  });
  return {
    id: row.id,
    status: row.status,
    a: side(row.documentAId, row.documentA, row.versionA, row.chunkAId),
    b: side(row.documentBId, row.documentB, row.versionB, row.chunkBId),
    question: row.question,
    firstDetectedAt: row.firstDetectedAt,
    lastDetectedAt: row.lastDetectedAt,
    occurrences: row.occurrences,
    resolvedAt: row.resolvedAt,
    resolvedById: row.resolvedById,
    resolutionNote: row.resolutionNote,
  };
}
