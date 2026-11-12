/* Cuenta los documentos en PostgreSQL (spec 007, plan 4): una sola sentencia, sin traer ningún
documento a Node */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RepositoryUnavailableError } from '../documents.repository';
import { isUnavailable } from '../prisma-documents.repository';
import {
  DocumentMetricsQuery,
  DocumentMetricsRepository,
  DocumentMetricsTotals,
} from './document-metrics.repository';

// R6: el período se aplica a cuándo se cargó el documento (D16), [from, to).
function uploadedCondition({
  uploadedFrom,
  uploadedTo,
}: DocumentMetricsQuery): Prisma.Sql {
  const conditions = [
    uploadedFrom ? Prisma.sql`d.created_at >= ${uploadedFrom}` : null,
    uploadedTo ? Prisma.sql`d.created_at < ${uploadedTo}` : null,
  ].filter((condition): condition is Prisma.Sql => condition !== null);
  return conditions.length === 0
    ? Prisma.sql`TRUE`
    : Prisma.join(conditions, ' AND ');
}

// R4: solo ACTIVE. El alcance es un EXISTS y no un JOIN, así un documento con varias áreas es una
// sola fila (P5). Las fechas de revisión viajan como texto ::date, nunca como instantes: así la
// comparación no depende de la zona de la sesión de la base (D8). Los conteos van a int para que
// lleguen como number y no como bigint.
export function documentMetricsSql(query: DocumentMetricsQuery): Prisma.Sql {
  const { areaIds, today, dueSoonThrough } = query;
  const inScope =
    areaIds === null
      ? Prisma.empty
      : Prisma.sql`AND EXISTS (
          SELECT 1 FROM document_areas da
          WHERE da.document_id = d.id AND da.area_id = ANY(${areaIds}::uuid[]))`;

  // Las tres condiciones de revisión son las de reviewStatusOf (R1 de la spec 005) y suman active.
  return Prisma.sql`
    SELECT count(*)::int AS active,
           count(*) FILTER (WHERE d.review_date > ${dueSoonThrough}::date)::int AS "upToDate",
           count(*) FILTER (
             WHERE d.review_date >= ${today}::date
               AND d.review_date <= ${dueSoonThrough}::date
           )::int AS "dueSoon",
           count(*) FILTER (WHERE d.review_date < ${today}::date)::int AS overdue,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM document_versions v
             WHERE v.document_id = d.id
               AND v.status = 'CURRENT'
               AND v.processing_status = 'FAILED'
           ))::int AS "processingFailed",
           count(*) FILTER (WHERE ${uploadedCondition(query)})::int AS uploaded
    FROM documents d
    WHERE d.status = 'ACTIVE'
    ${inScope}
  `;
}

@Injectable()
export class PrismaDocumentMetricsRepository extends DocumentMetricsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Una sola sentencia es una sola foto de la base: no hace falta transacción (D9).
  async totals(query: DocumentMetricsQuery): Promise<DocumentMetricsTotals> {
    try {
      const [row] = await this.prisma.$queryRaw<DocumentMetricsTotals[]>(
        documentMetricsSql(query),
      );
      return toTotals(row);
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

// Campo por campo, así solo salen del repositorio las columnas esperadas.
const toTotals = (row: DocumentMetricsTotals): DocumentMetricsTotals => ({
  active: row.active,
  upToDate: row.upToDate,
  dueSoon: row.dueSoon,
  overdue: row.overdue,
  processingFailed: row.processingFailed,
  uploaded: row.uploaded,
});
