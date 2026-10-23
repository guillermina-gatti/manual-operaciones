// Formato de las fechas de un documento (F7).

// Zona horaria de la empresa (D1 del plan 001): la fecha de carga se muestra igual en cualquier navegador.
export const COMPANY_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2027-03-01" → "01/03/2027". No pasa por new Date: "2027-03-01" sería medianoche UTC,
// que en Argentina todavía es el 28/02, y la tarjeta mostraría un día menos.
export function formatReviewDate(value: string): string {
  const match = DATE_ONLY.exec(value);
  if (!match) return '—';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

const createdAtFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: COMPANY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "2026-10-23T15:00:00.000Z" → "23/10/2026, 12:00", en la hora de Buenos Aires.
export function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return createdAtFormat.format(date);
}
