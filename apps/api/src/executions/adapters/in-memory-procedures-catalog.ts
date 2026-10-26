/* In-memory procedures catalog */
import {
  CatalogProcedureVersion,
  ProceduresCatalog,
} from '../ports/procedures-catalog';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  FixtureProcedureVersion,
} from './procedure-fixtures';

// Simulation until Mica exposes procedures. No @Injectable: Nest builds it without
// arguments and it takes the fixtures.
export class InMemoryProceduresCatalog extends ProceduresCatalog {
  private readonly versions: Map<string, FixtureProcedureVersion>;

  constructor(
    versions: FixtureProcedureVersion[] = FIXTURE_PROCEDURE_VERSIONS,
  ) {
    super();
    this.versions = new Map(
      versions.map((version) => [version.versionId, { ...version }]),
    );
  }

  findPublished(procedureId: string): Promise<CatalogProcedureVersion | null> {
    const version = [...this.versions.values()].find(
      (v) => v.procedureId === procedureId && v.published,
    );
    return Promise.resolve(version ? toCatalogVersion(version) : null);
  }

  findVersion(versionId: string): Promise<CatalogProcedureVersion | null> {
    const version = this.versions.get(versionId);
    return Promise.resolve(version ? toCatalogVersion(version) : null);
  }

  // Test helper: publishes a version and unpublishes the others of the same
  // procedure, as publishing a new version would.
  publish(versionId: string): void {
    const target = this.versions.get(versionId);
    if (!target) throw new Error(`Unknown procedure version ${versionId}`);
    for (const version of this.versions.values()) {
      if (version.procedureId === target.procedureId) {
        version.published = version.versionId === versionId;
      }
    }
  }
}

// A copy without the published flag, steps sorted by order, so callers cannot
// change the catalog.
const toCatalogVersion = (
  version: FixtureProcedureVersion,
): CatalogProcedureVersion => ({
  procedureId: version.procedureId,
  versionId: version.versionId,
  areaIds: [...version.areaIds],
  steps: version.steps
    .map((step) => ({ id: step.id, order: step.order, title: step.title }))
    .sort((a, b) => a.order - b.order),
});
