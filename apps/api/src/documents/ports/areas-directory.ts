// Puerto (plan 5.3): las áreas son de otra pareja y nos relacionamos con ellas solo por id.
// La implementación real traduce sus fallos de conexión a RepositoryUnavailableError, así la carga
// y las consultas responden 503 (D13). Los demás errores no se traducen.
export abstract class AreasDirectory {
  // Devuelve, de los ids recibidos, solo los que existen (R5).
  abstract findExistingIds(ids: string[]): Promise<string[]>;
}
