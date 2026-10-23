// Estado del procesamiento de la versión vigente (F6). Lo muestra el detalle, solo al ADMIN.
import type { ProcessingStatus } from '@/lib/api';

const LABELS: Record<ProcessingStatus, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  READY: 'Listo',
  FAILED: 'Con error',
};

const COLORS: Record<ProcessingStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  PROCESSING: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  READY: 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
  FAILED: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
};

export function ProcessingStatusBadge({ status }: { status: ProcessingStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-medium ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
