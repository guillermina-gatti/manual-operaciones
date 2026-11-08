// The employee's own activity (/ejecuciones/mi-actividad): only their executions, with the same
// filters as /metricas, which live in the address.
export const MY_ACTIVITY_PATH = '/ejecuciones/mi-actividad';

// "Sin avanzar hace más de 24 h": what the API counts as abandoned, said as what it is. The
// execution is not closed; the employee can still resume it.
export const staleLabel = (staleAfterHours: number) =>
  `Sin avanzar hace más de ${staleAfterHours} h`;
