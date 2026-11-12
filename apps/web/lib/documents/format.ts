// Formato de las fechas de un documento (F7) y, desde la spec 008, de sus personas y áreas.
import type { DocumentReference } from '@/lib/api';

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

// Solo el día, sin la hora: "Archivado desde…" (spec 003) y "Última revisión" (spec 005).
const dayFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: COMPANY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const sizeFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

// Tamaño de un archivo: 2097152 → "2 MB", 1536 → "1,5 KB".
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

// "2026-10-31T01:30:00.000Z" → "30/10/2026": el día de ese instante en Buenos Aires.
export function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dayFormat.format(date);
}

// "2026-10-23T15:00:00.000Z" → "23/10/2026, 12:00", en la hora de Buenos Aires.
export function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return createdAtFormat.format(date);
}

// Spec 008 (F2, F3): una persona o un área de la respuesta. Sin nombre (la API no la encontró), "—",
// sin aclarar el estado. Inactiva, con la palabra: "(inactivo)" para personas, "(inactiva)" para áreas.
const MISSING = '—';

function formatReference(
  reference: DocumentReference | null | undefined,
  inactiveLabel: string,
): string {
  if (!reference?.name) return MISSING;
  return reference.isActive ? reference.name : `${reference.name} (${inactiveLabel})`;
}

export function formatPerson(person: DocumentReference | null | undefined): string {
  return formatReference(person, 'inactivo');
}

export function formatArea(area: DocumentReference): string {
  return formatReference(area, 'inactiva');
}

// Las áreas de un documento, en el orden en que llegan, o "—" si no hay.
export function formatAreas(areas: DocumentReference[]): string {
  return areas.length > 0 ? areas.map(formatArea).join(', ') : MISSING;
}
