/* In-memory procedures catalog */
import {
  CatalogProcedureVersion,
  CatalogPublication,
  ProceduresCatalog,
} from '../ports/procedures-catalog';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  FixtureProcedureVersion,
  PROCEDURE_AREAS,
} from './procedure-fixtures';

// Simulation until Mica exposes procedures. No @Injectable: Nest builds it without
// arguments and it takes the fixtures.
export class InMemoryProceduresCatalog extends ProceduresCatalog {
  private readonly versions: Map<string, FixtureProcedureVersion>;
  // Current areas of each procedure, shared by all its versions.
  private readonly areas: Map<string, string[]>;

  constructor(
    versions: FixtureProcedureVersion[] = FIXTURE_PROCEDURE_VERSIONS,
    areas: Record<string, string[]> = PROCEDURE_AREAS,
  ) {
    super();
    this.versions = new Map(
      versions.map((version) => [version.versionId, { ...version }]),
    );
    this.areas = new Map(
      Object.entries(areas).map(([procedureId, areaIds]) => [
        procedureId,
        [...areaIds],
      ]),
    );
  }

  findPublished(procedureId: string): Promise<CatalogProcedureVersion | null> {
    const version = [...this.versions.values()].find(
      (v) => v.procedureId === procedureId && v.published,
    );
    return Promise.resolve(version ? this.toCatalogVersion(version) : null);
  }

  findVersion(versionId: string): Promise<CatalogProcedureVersion | null> {
    const version = this.versions.get(versionId);
    return Promise.resolve(version ? this.toCatalogVersion(version) : null);
  }

  // Published at some point means published now or superseded; a draft never counts.
  findPublishedAfter(versionId: string): Promise<CatalogPublication[]> {
    const base = this.versions.get(versionId);
    const baseNumber = base?.versionNumber;
    if (!base || baseNumber === undefined) return Promise.resolve([]);
    const after = [...this.versions.values()]
      .filter(
        (v) =>
          v.procedureId === base.procedureId &&
          (v.published || v.superseded === true) &&
          v.versionNumber !== undefined &&
          v.versionNumber > baseNumber,
      )
      .map((v): CatalogPublication => ({
        versionId: v.versionId,
        versionNumber: v.versionNumber ?? 0,
        isCritical: v.isCritical ?? false,
        changeSummary: v.changeSummary ?? null,
        publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
      }))
      .sort((a, b) => a.versionNumber - b.versionNumber);
    return Promise.resolve(after);
  }

  // Test helper: publishes a version; the one published before becomes superseded, as
  // publishing a new version would.
  publish(versionId: string): void {
    const target = this.versions.get(versionId);
    if (!target) throw new Error(`Unknown procedure version ${versionId}`);
    for (const version of this.versions.values()) {
      if (version.procedureId !== target.procedureId) continue;
      if (version.versionId === versionId) {
        version.published = true;
        version.superseded = false;
      } else if (version.published) {
        version.published = false;
        version.superseded = true;
      }
    }
  }

  // Test helper: adds a version as given (a draft unless it says published), for
  // example a new critical one to publish while an execution is running.
  addVersion(version: FixtureProcedureVersion): void {
    this.versions.set(version.versionId, {
      ...version,
      steps: version.steps.map((step) => ({ ...step })),
    });
  }

  // Test helper: assigns the procedure to other areas, for all its versions.
  assignAreas(procedureId: string, areaIds: string[]): void {
    this.areas.set(procedureId, [...areaIds]);
  }

  // A copy without the published flags, with the current areas and the steps sorted
  // by order, so callers cannot change the catalog.
  private toCatalogVersion(
    version: FixtureProcedureVersion,
  ): CatalogProcedureVersion {
    return {
      procedureId: version.procedureId,
      versionId: version.versionId,
      areaIds: [...(this.areas.get(version.procedureId) ?? [])],
      steps: version.steps
        .map((step) => ({
          id: step.id,
          order: step.order,
          title: step.title,
          description: step.description,
          stepKey: step.stepKey,
        }))
        .sort((a, b) => a.order - b.order),
      title: version.title,
      versionNumber: version.versionNumber,
      isCritical: version.isCritical,
      changeSummary: version.changeSummary,
    };
  }
}
