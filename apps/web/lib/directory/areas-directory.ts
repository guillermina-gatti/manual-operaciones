// Áreas que la web necesita conocer (plan 002, sección 3.3). La simulación y la versión real
// (GET /api/areas, Q2) cumplen esta interfaz.
export interface Area {
  id: string;
  name: string;
  isActive: boolean;
}

// La API conserva también las áreas históricas: el estado solo modifica su etiqueta visible.
export function displayAreaName(area: Area): string {
  return area.isActive === false ? `${area.name} (inactiva)` : area.name;
}

export function toAreaNameMap(areas: Area[]): Record<string, string> {
  return Object.fromEntries(areas.map((area) => [area.id, displayAreaName(area)]));
}

export interface AreasDirectory {
  listAreas(): Promise<Area[]>;
}
