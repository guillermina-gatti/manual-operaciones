/* Directorio de áreas en memoria */
import { AreasDirectory, type DirectoryArea } from '../ports/areas-directory';
import { AREA_IDS } from './fixtures';

// Admite IDs simples para los tests antiguos y registros completos para probar inactivos.
export class InMemoryAreasDirectory extends AreasDirectory {
  private readonly areas: Map<string, DirectoryArea>;

  constructor(
    entries: Array<string | DirectoryArea> = [
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: true },
    ],
  ) {
    super();
    const normalized = entries.map((entry): DirectoryArea =>
      typeof entry === 'string'
        ? { id: entry, name: entry, isActive: true }
        : { ...entry },
    );
    this.areas = new Map(normalized.map((area) => [area.id, area]));
  }

  findExistingIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    return Promise.resolve(unique.filter((id) => this.areas.has(id)));
  }

  findByIds(ids: string[]): Promise<DirectoryArea[]> {
    const unique = [...new Set(ids)];
    const found = unique
      .map((id) => this.areas.get(id))
      .filter((area): area is DirectoryArea => area !== undefined)
      .map((area) => ({ ...area }));
    return Promise.resolve(found);
  }
}
