// Directorio de áreas simulado, sobre los fixtures, hasta que exista GET /api/areas (T28).
import type { Area, AreasDirectory } from './areas-directory';
import { AREAS } from './fixtures';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Options {
  areas?: Area[];
  // Demora de cada respuesta, para que el estado "cargando" se vea al probar a mano.
  delayMs?: number;
}

export function createFakeAreasDirectory({
  areas = AREAS,
  delayMs = 300,
}: Options = {}): AreasDirectory {
  return {
    async listAreas() {
      await wait(delayMs);
      return areas.map((area) => ({ ...area }));
    },
  };
}
