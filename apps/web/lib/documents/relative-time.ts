// "Hace X" de una fecha (vista Lista y Tarjetas de /documentos): "hace 3 días", "ayer", "recién".
// Recibe "ahora" de afuera: quien dibuja la lista lo toma una sola vez, así todas las filas usan el
// mismo momento y el resultado no depende de cuándo se llama.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// De la unidad más grande a la más chica; se usa la primera que entra al menos una vez.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];

const relativeFormat = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

// null si la fecha no se puede leer. Una fecha apenas en el futuro (relojes desfasados) cuenta como
// "recién", nunca "dentro de…".
export function formatRelative(value: string, now: Date): string | null {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;

  const elapsed = Math.max(now.getTime() - time, 0);
  if (elapsed < MINUTE) return 'recién';

  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return relativeFormat.format(-Math.floor(elapsed / size), unit);
  }
  return 'recién';
}
