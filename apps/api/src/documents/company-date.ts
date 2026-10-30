/* Fechas de la empresa: "hoy" en hora de Argentina y cuentas con días (spec 005, plan 1.2).
Las fechas sin hora viajan como YYYY-MM-DD, que ordena igual que las fechas que representa. */

const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// La zona se lee en cada llamada: APP_TIMEZONE es configurable (D1 del plan 001). Exportada para el
// período de las métricas de documentos (spec 007).
export const companyTimeZone = () =>
  process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE;

// La fecha YYYY-MM-DD de ese instante en la zona de la empresa. Era el today() de DocumentWriteSteps.
export function todayInCompany(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: companyTimeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Suma días a una fecha YYYY-MM-DD. Date.UTC acomoda el fin de mes y de año (31/12 + 1 = 01/01).
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// Como se guarda una columna @db.Date: la medianoche UTC de ese día.
export const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
