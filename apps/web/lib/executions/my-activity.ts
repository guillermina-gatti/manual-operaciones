// The employee's own activity (/ejecuciones/mi-actividad): only their executions, with the same
// filters as /metricas, which live in the address.
import { todayInCompany } from '@/lib/metrics/filters';
import { formatDay } from '@/lib/metrics/format';
import { formatTime } from './format';

export const MY_ACTIVITY_PATH = '/ejecuciones/mi-actividad';

// "Sin avanzar hace más de 24 h": what the API counts as abandoned, said as what it is. The
// execution is not closed; the employee can still resume it.
export const staleLabel = (staleAfterHours: number) =>
  `Sin avanzar hace más de ${staleAfterHours} h`;

// "27 oct 2026, 10:05", in the company's time zone. Something that is not a date → "—".
export function formatLastActivity(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDay(todayInCompany(date))}, ${formatTime(value)}`;
}
