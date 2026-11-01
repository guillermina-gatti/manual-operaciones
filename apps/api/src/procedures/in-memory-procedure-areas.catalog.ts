/* In-memory areas catalog for specs; it takes the areas it knows. No @Injectable: Nest never builds it */
import { AreaState, ProcedureAreasCatalog } from './procedure-areas.catalog';

export class InMemoryProcedureAreasCatalog extends ProcedureAreasCatalog {
  private readonly areas: Map<string, AreaState>;

  constructor(areas: AreaState[] = []) {
    super();
    this.areas = new Map(areas.map((area) => [area.id, { ...area }]));
  }

  findStates(ids: string[]): Promise<AreaState[]> {
    const found = ids
      .map((id) => this.areas.get(id))
      .filter((area): area is AreaState => area !== undefined);
    return Promise.resolve(found.map((area) => ({ ...area })));
  }
}
