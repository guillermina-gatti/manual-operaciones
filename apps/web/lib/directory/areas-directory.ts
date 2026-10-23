// Áreas que la web necesita conocer (plan 002, sección 3.3). La simulación y la versión real
// (GET /api/areas, Q2) cumplen esta interfaz.
export interface Area {
  id: string;
  name: string;
}

export interface AreasDirectory {
  listAreas(): Promise<Area[]>;
}
