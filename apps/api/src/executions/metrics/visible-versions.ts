/* The catalog versions with executions whose procedure is currently in a scope. Shared by
the procedures metrics (HU38) and the personal metrics of the employee */
import type { Logger } from '@nestjs/common';
import type {
  CatalogProcedureVersion,
  ProceduresCatalog,
} from '../ports/procedures-catalog';
import { inScope } from './metrics-access.policy';
import type { MetricsScope } from './metrics-access.policy';

// A version the catalog does not know is left out and logged: without it there are no
// steps nor areas to check.
export async function findVisibleVersions(
  catalog: ProceduresCatalog,
  logger: Logger,
  versionIds: string[],
  scope: MetricsScope,
): Promise<Map<string, CatalogProcedureVersion>> {
  const found = await Promise.all(
    [...new Set(versionIds)].map(async (versionId) => {
      const version = await catalog.findVersion(versionId);
      if (!version) {
        logger.warn({
          message:
            'Versión de procedimiento con ejecuciones que el catálogo no conoce',
          procedureVersionId: versionId,
        });
      }
      return version;
    }),
  );
  return new Map(
    found
      .filter((v): v is CatalogProcedureVersion => v !== null)
      .filter((v) => inScope(scope, v.areaIds))
      .map((v) => [v.versionId, v]),
  );
}
