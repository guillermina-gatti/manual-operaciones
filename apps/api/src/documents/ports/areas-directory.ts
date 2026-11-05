// Puerto interno: existencia para validaciones y detalle para referencias historicas.
export interface DirectoryArea {
  id: string;
  name: string;
  isActive: boolean;
}

export abstract class AreasDirectory {
  // Compatibilidad con validaciones actuales de Documentos.
  abstract findExistingIds(ids: string[]): Promise<string[]>;
  // Incluye areas activas e inactivas. Los IDs inexistentes se omiten.
  abstract findByIds(ids: string[]): Promise<DirectoryArea[]>;
}
