// El estado del procesamiento en el detalle (F6, solo para el ADMIN). Listo dice "Listo para el
// asistente", para que se entienda que ya se puede consultar desde el asistente (plan 002, D8). El resto
// de los estados, como siempre (ProcessingStatusBadge, que también usa el historial con "Listo").
import type { ProcessingStatus } from '@/lib/api';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import { StatusDot } from './design';

export function DetailProcessingStatus({ status }: { status: ProcessingStatus }) {
  if (status === 'READY') return <StatusDot tone="exito">Listo para el asistente</StatusDot>;
  return <ProcessingStatusBadge status={status} />;
}
