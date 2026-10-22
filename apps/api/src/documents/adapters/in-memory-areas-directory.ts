import { AreasDirectory } from '../ports/areas-directory';
import { AREA_IDS } from './fixtures';

// Simulación hasta que la otra pareja exponga sus áreas (plan 5.3).
// Sin @Injectable: Nest la construye sin argumentos y toma los fixtures.
export class InMemoryAreasDirectory extends AreasDirectory {
  private readonly areaIds: Set<string>;

  constructor(areaIds: string[] = Object.values(AREA_IDS)) {
    super();
    this.areaIds = new Set(areaIds);
  }

  findExistingIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    return Promise.resolve(unique.filter((id) => this.areaIds.has(id)));
  }
}
