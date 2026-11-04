// Estado del procesamiento de una versión (F6). Lo muestran el detalle y el historial, solo al ADMIN.
import type { ProcessingStatus } from '@/lib/api';
import { StatusDot } from './design';
import type { DotTone } from './design';

const LABELS: Record<ProcessingStatus, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  READY: 'Listo',
  FAILED: 'Con error',
};

const TONES: Record<ProcessingStatus, DotTone> = {
  PENDING: 'gris',
  PROCESSING: 'azul',
  READY: 'exito',
  FAILED: 'peligro',
};

export function ProcessingStatusBadge({ status }: { status: ProcessingStatus }) {
  return <StatusDot tone={TONES[status]}>{LABELS[status]}</StatusDot>;
}
