// Puerto para verificar y consultar la existencia de áreas por su identificador.
export abstract class AreasDirectory {
  // Devuelve, de los ids recibidos, solo los que existen (R5).
  abstract findExistingIds(ids: string[]): Promise<string[]>;
}
