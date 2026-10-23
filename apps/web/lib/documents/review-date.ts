// Fecha mínima de revisión: mañana en la zona horaria de la empresa (F2; D1 del plan 001).
// La API compara igual, así que la web nunca acepta una fecha que la API rechace.

// Hoy en esa zona, como YYYY-MM-DD.
function todayIn(timeZone: string, now: Date): string {
  // en-CA escribe las fechas como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Mañana en esa zona, como YYYY-MM-DD: el valor mínimo del <input type="date">.
export function tomorrowIn(timeZone: string, now: Date): string {
  const [year, month, day] = todayIn(timeZone, now).split('-').map(Number);
  // Date.UTC acomoda el fin de mes y de año (31/12 + 1 = 01/01).
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
