// Puerto (plan 5.3): las áreas son de otra pareja y nos relacionamos con ellas solo por id.
export abstract class AreasDirectory {
  // Devuelve, de los ids recibidos, solo los que existen (R5).
  abstract findExistingIds(ids: string[]): Promise<string[]>;
}
