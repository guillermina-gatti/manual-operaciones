// Estado de revisión de un documento (spec 005, F1). Siempre con la palabra, nunca solo el color.
// "Al día" no lleva etiqueta. El estado lo decide la API (D16): sin `review`, no hay nada que mostrar.
import type { ReviewStatus } from '@/lib/api';

type Shown = Exclude<ReviewStatus, 'UP_TO_DATE'>;

const LABELS: Record<Shown, string> = {
  OVERDUE: 'Vencido',
  DUE_SOON: 'Vence pronto',
};

// La misma forma que "Archivado"; colores con contraste en modo claro y oscuro.
const COLORS: Record<Shown, string> = {
  OVERDUE: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
  DUE_SOON: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
};

export function ReviewStatusBadge({ status }: { status?: ReviewStatus | null }) {
  if (status !== 'OVERDUE' && status !== 'DUE_SOON') return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
