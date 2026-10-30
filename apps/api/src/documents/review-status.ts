/* Estado de revisión de un documento (spec 005, R1 a R3; plan 1.1). Se calcula en cada consulta a
partir de la fecha de revisión: no se guarda (R3, P7). */

import type { Role } from '../common/auth';
import type { DocumentStatus } from '../generated/prisma/client';
import { addDays } from './company-date';
import { canReview } from './document-access.policy';

export type ReviewStatus = 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE';

// R1, P1: "por vencer" son los próximos 30 días, contando hoy.
export const DUE_SOON_DAYS = 30;

// R1 y R2. Las dos fechas son YYYY-MM-DD y "today" ya está en hora de la empresa (todayInCompany):
// se comparan como texto, así no hay horas ni zonas en la comparación.
export function reviewStatusOf(
  document: { status: DocumentStatus; reviewDate: string },
  today: string,
): ReviewStatus | null {
  if (document.status === 'ARCHIVED') return null;
  if (document.reviewDate < today) return 'OVERDUE';
  if (document.reviewDate <= addDays(today, DUE_SOON_DAYS)) return 'DUE_SOON';
  return 'UP_TO_DATE';
}

// Lo que ve el ADMIN o el responsable de un documento (plan 2.1): el estado (null si está archivado) y
// la última revisión (null si nunca se revisó).
export interface DocumentReviewInfo {
  status: ReviewStatus | null;
  lastReviewedAt: string | null;
  lastReviewedById: string | null;
}

// Lo mínimo del documento que hace falta. Los campos de la última revisión son opcionales, como en
// DocumentRecord, para los registros armados a mano en los tests.
interface ReviewableDocument {
  ownerId: string;
  status: DocumentStatus;
  reviewDate: Date;
  lastReviewedAt?: Date | null;
  lastReviewedById?: string | null;
}

// R4 (D6): undefined si el usuario no es ADMIN ni el responsable; así la respuesta no lleva `review`.
// reviewDate es un @db.Date: llega como medianoche UTC y se toma la fecha en UTC.
export function reviewFor(
  user: { id: string; role: Role },
  document: ReviewableDocument,
  today: string,
): DocumentReviewInfo | undefined {
  if (!canReview(user, document)) return undefined;
  return {
    status: reviewStatusOf(
      {
        status: document.status,
        reviewDate: document.reviewDate.toISOString().slice(0, 10),
      },
      today,
    ),
    lastReviewedAt: document.lastReviewedAt?.toISOString() ?? null,
    lastReviewedById: document.lastReviewedById ?? null,
  };
}
