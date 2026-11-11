/* Forma de los datos de demostración (spec 016) */

export interface DemoStep {
  id: string;
  stepKey: string; // el mismo paso conserva su clave entre versiones (spec 015, R7)
  title: string;
  description: string;
}

export type DemoStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

export interface DemoVersion {
  id: string;
  versionNumber: number;
  status: DemoStatus;
  title: string;
  description: string;
  createdAt: Date;
  publishedAt: Date | null;
  isCritical: boolean;
  changeSummary: string | null;
  steps: DemoStep[];
}

export interface DemoProcedure {
  id: string;
  areas: ('ventas' | 'operaciones')[];
  versions: DemoVersion[];
}
