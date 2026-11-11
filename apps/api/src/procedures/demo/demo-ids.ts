/* Ids fijos y armado de versiones de la demostración (spec 016). Prefijos como los de
procedure-fixtures: 1a procedimientos, 1b versiones, 1c pasos, 1d claves de paso. */
import { AREA_IDS, FIXTURE_USERS } from '../../documents/adapters/fixtures';
import type { CatalogStep } from '../../executions/ports/procedures-catalog';
import type { DemoStatus, DemoStep, DemoVersion } from './demo-types';

// Los pasos de los fixtures de ejecuciones, que siempre traen su clave de paso.
export function fromCatalog(steps: CatalogStep[]): DemoStep[] {
  return steps.map((step) => {
    if (!step.stepKey) throw new Error(`El paso ${step.id} no tiene stepKey`);
    return {
      ...step,
      description: step.description ?? '',
      stepKey: step.stepKey,
    };
  });
}

export const DEMO_ADMIN_ID = FIXTURE_USERS.admin.id;
export const DEMO_AREA_IDS = AREA_IDS;

export const demoUuid = (prefix: string, n: number): string =>
  `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// [número de clave dentro del procedimiento, título, descripción]
export type StepDef = readonly [number, string, string];

// Los pasos de la versión `v` del procedimiento `p` (p >= 3: no choca con los fixtures).
export function demoSteps(p: number, v: number, defs: StepDef[]): DemoStep[] {
  return defs.map(([key, title, description], index) => ({
    id: demoUuid('1c', 1000 * p + 100 * v + index + 1),
    stepKey: demoUuid('1d', 1000 * p + key),
    title,
    description,
  }));
}

interface VersionInit {
  id: string;
  versionNumber: number;
  status: DemoStatus;
  title: string;
  description: string;
  day: string; // fecha fija de publicación (UTC)
  steps: DemoStep[];
  changeSummary?: string;
}

// Un borrador no tiene publishedAt; una versión con resumen es un cambio crítico.
export function demoVersion(init: VersionInit): DemoVersion {
  const date = new Date(`${init.day}T12:00:00.000Z`);
  const draft = init.status === 'DRAFT';
  return {
    id: init.id,
    versionNumber: init.versionNumber,
    status: init.status,
    title: init.title,
    description: init.description,
    createdAt: new Date(date.getTime() - 3 * 86_400_000),
    publishedAt: draft ? null : date,
    isCritical: init.changeSummary !== undefined,
    changeSummary: init.changeSummary ?? null,
    steps: init.steps,
  };
}
