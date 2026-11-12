/* Compares two versions step by step (spec 015, R10): pure, with no database */
import type { ProcedureVersionStatus } from '../generated/prisma/client';

// A step with its key, which joins "the same step" across versions (D11). The key stays here.
export interface CompareStep {
  key: string;
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface CompareVersion {
  id: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  steps: CompareStep[];
}

// A step as it leaves: without its key.
export interface ComparedStep {
  id: string;
  order: number;
  title: string;
  description: string;
}

export type ChangedField = 'title' | 'description' | 'order';

export interface ModifiedStep {
  before: ComparedStep;
  after: ComparedStep;
  changedFields: ChangedField[];
}

export interface VersionRef {
  id: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
}

export interface Comparison {
  from: VersionRef;
  to: VersionRef;
  added: ComparedStep[];
  removed: ComparedStep[];
  modified: ModifiedStep[];
  unchanged: number;
}

const byOrder = (a: CompareStep, b: CompareStep) => a.order - b.order;

const plain = ({ id, order, title, description }: CompareStep): ComparedStep => ({
  id,
  order,
  title,
  description,
});

const ref = ({ id, versionNumber, status }: CompareVersion): VersionRef => ({
  id,
  versionNumber,
  status,
});

// Fields in this order: title, description, order.
function changedFields(before: CompareStep, after: CompareStep): ChangedField[] {
  const fields: ChangedField[] = [];
  if (before.title !== after.title) fields.push('title');
  if (before.description !== after.description) fields.push('description');
  if (before.order !== after.order) fields.push('order');
  return fields;
}

// Added: in `to` and not in `from`. Removed: the other way. Modified: in both and changed.
export function compareVersions(from: CompareVersion, to: CompareVersion): Comparison {
  const before = new Map(from.steps.map((step) => [step.key, step]));
  const after = new Map(to.steps.map((step) => [step.key, step]));
  const result: Comparison = { from: ref(from), to: ref(to), added: [], removed: [], modified: [], unchanged: 0 };

  for (const step of [...to.steps].sort(byOrder)) {
    const old = before.get(step.key);
    if (!old) {
      result.added.push(plain(step));
      continue;
    }
    const fields = changedFields(old, step);
    if (fields.length === 0) result.unchanged += 1;
    else result.modified.push({ before: plain(old), after: plain(step), changedFields: fields });
  }
  result.removed = [...from.steps]
    .filter((step) => !after.has(step.key))
    .sort(byOrder)
    .map(plain);
  return result;
}
