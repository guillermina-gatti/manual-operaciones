// Reloj de documentos (spec 005, D2 y D20): los tests fijan "ahora" sin depender de la hora en que
// corren. Es propio de documentos; el de las ejecuciones (src/executions/ports/clock.ts) es de la
// pareja B y es otro token de inyección.
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
