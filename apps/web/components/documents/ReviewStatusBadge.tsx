// Estado de revisión de un documento (spec 005, F1). Siempre con la palabra, nunca solo el color.
// "Al día" no lleva etiqueta. El estado lo decide la API (D16): sin `review`, no hay nada que mostrar.
import type { ReviewStatus } from '@/lib/api';
import { StatusDot } from './design';

export function ReviewStatusBadge({ status }: { status?: ReviewStatus | null }) {
  if (status === 'OVERDUE') return <StatusDot tone="peligro">Vencido</StatusDot>;
  if (status === 'DUE_SOON') return <StatusDot tone="durazno">Vence pronto</StatusDot>;
  return null;
}
