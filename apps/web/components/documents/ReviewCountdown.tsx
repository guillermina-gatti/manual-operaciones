'use client';

// La revisión del detalle en un vistazo (spec 005): la próxima fecha, cuánto falta y una barra que se
// vacía a medida que se acerca. Los días se cuentan en Buenos Aires con daysUntilReview, igual que la
// barra de frescura de design.tsx. El color lo decide la API (review.status, D16); acá no se recalcula.
import { useState } from 'react';
import type { ReviewStatus } from '@/lib/api';
import { formatReviewDate } from '@/lib/documents/format';
import { daysUntilReview } from './design';
import { META_LABEL } from './list-design';

// "Faltan 12 días", "Falta 1 día", "Vence hoy", "Venció ayer", "Venció hace 3 días".
export function describeCountdown(days: number): string {
  if (days > 1) return `Faltan ${days} días`;
  if (days === 1) return 'Falta 1 día';
  if (days === 0) return 'Vence hoy';
  if (days === -1) return 'Venció ayer';
  return `Venció hace ${-days} días`;
}

const BAR: Record<ReviewStatus, string> = {
  UP_TO_DATE: 'bg-exito',
  DUE_SOON: 'bg-naranja',
  OVERDUE: 'bg-peligro',
};

const TEXT: Record<ReviewStatus, string> = {
  UP_TO_DATE: 'text-texto-suave',
  DUE_SOON: 'text-durazno-texto',
  OVERDUE: 'text-rosa-alerta-texto',
};

interface ReviewCountdownProps {
  // null solo si está archivado (R2); el detalle no muestra el panel en ese caso.
  status: ReviewStatus | null;
  // YYYY-MM-DD.
  reviewDate: string;
  // Desde cuándo se cuenta: la última revisión o la carga (ISO).
  since: string;
  // Los tests pasan una fecha fija.
  now?: Date;
}

export function ReviewCountdown({ status, reviewDate, since, now: fixedNow }: ReviewCountdownProps) {
  // Se toma una vez: este panel solo se dibuja en el navegador, con los datos ya pedidos.
  const [now] = useState(() => fixedNow ?? new Date());
  const days = daysUntilReview(reviewDate, now);
  const sinceDate = new Date(since);
  // Días entre el inicio (última revisión o carga) y la fecha de revisión.
  const total = Number.isNaN(sinceDate.getTime()) ? 0 : daysUntilReview(reviewDate, sinceDate);
  const ratio = total > 0 ? Math.min(Math.max(days / total, 0), 1) : days > 0 ? 1 : 0;
  // Siempre se ve un poco de barra, así el color acompaña al texto.
  const width = Math.max(ratio * 100, 6);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className={META_LABEL}>Próxima revisión</span>
        <span className="text-2xl font-extrabold tracking-[-0.01em] text-bosque tabular-nums">
          {formatReviewDate(reviewDate)}
        </span>
        <span className={`text-sm font-semibold ${status ? TEXT[status] : 'text-texto-suave'}`}>
          {describeCountdown(days)}
        </span>
      </div>
      <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-borde">
        <div
          data-part="bar"
          className={`h-full rounded-full ${status ? BAR[status] : 'bg-gris-reemplazada'}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
